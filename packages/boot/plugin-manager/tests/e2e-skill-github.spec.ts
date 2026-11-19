/**
 * End-to-end test for the GUI Skill install chain.
 *
 * This drives the exact chain the install button uses:
 *   PluginManagerController.inject() face
 *     -> editInstallSpec() -> runInstall()
 *     -> classifyInstallInput() -> startExtensionInstall()
 *     -> remote.extensionService.installExtension()
 *     -> real ExtensionManager.install()
 *
 * The live sm-research probe is gated behind SQH_E2E_GITHUB so the regular
 * suite never touches the network. The offline regression always runs and
 * proves a repository read failure is surfaced through the GUI as an
 * extension-install error, not a silent no-op or an invalid Skill name.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HostObservable } from '@liusiqi-dev/sqh-client-ui-slots'
import { expect, it, onTestFinished, vi } from 'vitest'

vi.mock('@liusiqi-dev/sqh-http-proxy', async importOriginal => ({
  ...(await importOriginal<typeof import('@liusiqi-dev/sqh-http-proxy')>()),
  proxyFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    (globalThis.fetch as typeof fetch)(input, init),
}))

import { ExtensionManager } from '../src/extension-service.ts'
import { PluginManagerController } from '../../../client/ui-plugin-manager/src/client/manager-store.ts'
import type { ConfigLedger } from '../../../client/ui-plugin-manager/src/client/config-ledger.ts'

const RAW = 'skill：https://github.com/Aether-liusiqi/sm-research'
const CLEAN = 'https://github.com/Aether-liusiqi/sm-research'

function ok<T>(value: T) {
  return { ok: true as const, value }
}

const NO_CONFIG: HostObservable<ConfigLedger> = {
  getSnapshot: () => ({ items: [], bundles: new Set(), rows: new Set() }),
  subscribe: () => () => {},
}

interface InstallRequest { spec: string; hint: string }

/**
 * Build the controller the same way the tab does, with a real ExtensionManager
 * answering the extensionService remote. Everything load() touches after the
 * install is stubbed so the post-install inventory refresh stays in memory.
 */
function gui(manager: ExtensionManager) {
  let busyAtInstall: string | undefined
  const installExtension = vi.fn((request: InstallRequest) => {
    // Capture the GUI state at the moment the button's chain reaches the service.
    busyAtInstall = controller.getSnapshot().install.extensionInstalling
    return Promise.resolve(manager.install(request)).then(value => ok(value))
  })
  const ctx = {
    get: () => ({ enabled: false, track: vi.fn() }),
    configForms: {
      describe: () => ({ getSnapshot: () => ({ view: { namespaces: [] } }), subscribe: () => () => {} }),
      get: vi.fn(),
    },
    remote: {
      pluginInventory: { list: vi.fn(() => Promise.resolve(ok({ entries: [], managementAvailable: true }))) },
      pluginManager: {
        listBundles: vi.fn(() => Promise.resolve(ok([]))),
        listPlugins: vi.fn(() => Promise.resolve(ok([]))),
        waitForInstall: vi.fn(() => Promise.resolve(ok(null))),
      },
      // installExtension answers carry ExtensionAnswer, so the Remote wrapper
      // produces a double envelope: { ok, value: { ok, value | error } }.
      extensionService: { installExtension },
    },
  } as never
  const controller = new PluginManagerController(ctx)
  onTestFinished(() => { controller.dispose() })
  const face = controller.inject(NO_CONFIG, text => typeof text === 'string' ? text : text.en)
  return { face, state: () => controller.getSnapshot(), installExtension, busy: () => busyAtInstall }
}

it.skipIf(!process.env.SQH_E2E_GITHUB)('E2E GUI install sm-research skill from GitHub', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-skill-gui-e2e-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: globalThis.fetch,
      token: () => undefined,
      installPlugin: vi.fn(async () => ({ location: 'unused', revision: 'x' })),
    })
    const g = gui(manager)

    // Same two calls the dialog makes when the user types the prefixed link
    // and clicks "安装".
    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => { expect(g.installExtension).toHaveBeenCalledOnce() }, { timeout: 15000 })
    // The GUI marked the skill channel busy before crossing the wire.
    expect(g.busy()).toBe('skill')
    expect(g.installExtension).toHaveBeenCalledWith({ spec: CLEAN, hint: 'skill' })

    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
      expect(g.state().notice?.kind).toBe('updated')
    }, { timeout: 60000 })

    expect(g.state().install.inputError).toBeNull()
    expect(g.state().targetLocation).toContain('skills')

    // Confirm the real installation landed on disk, not only in GUI state.
    const list = await manager.list('skill')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'skill', name: 'SM-research' })
    const skillFile = join(home, 'skills', 'SM-research', 'SKILL.md')
    expect(existsSync(skillFile)).toBe(true)
    const text = await readFile(skillFile, 'utf8')
    expect(text).toMatch(/^---\nname: SM-research/m)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}, 120000)

it('surfaces a repository read failure through the GUI as an extension-install error', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-skill-gui-net-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch,
      token: () => undefined,
      installPlugin: vi.fn(),
    })
    const g = gui(manager)

    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
      expect(g.state().notice?.kind).toBe('update-failed')
    })
    expect(g.state().install.inputError).toMatchObject({ problem: 'extension-install' })
    expect(g.state().install.inputError?.reason).toContain('网络')
    expect(g.state().install.inputError?.reason).not.toContain('invalid Skill name')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
