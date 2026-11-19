/**
 * End-to-end test for the GUI plugin (pnpm) install chain.
 *
 * This drives the exact chain the install button uses:
 *   PluginManagerController.inject() face
 *     -> editInstallSpec() -> runInstall()
 *     -> classifyInstallInput() -> remote.pluginManager.inspect()
 *     -> remote.extensionService.detectSource() (real classifier)
 *     -> remote.pluginManager.installBundle() -> real PluginManager.installBundle()
 *
 * The live npm probe is gated behind SQH_E2E_PLUGIN so the regular suite never
 * touches the network. The offline regression always runs and proves a
 * copy-pasted npmjs.com package URL is classified as a plugin, normalized to a
 * package name, and parsed as a registry spec.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@liusiqi-dev/cordis'
import type { HostObservable } from '@liusiqi-dev/sqh-client-ui-slots'
import { expect, it, onTestFinished, vi } from 'vitest'
import {
  boot, initProfile, loadProfileDirectory, readProfileManifest, readProfilePatches,
  type ProfileContext,
} from '@liusiqi-dev/sqh-app-boot'
import type { PatchOptions } from '@liusiqi-dev/cordis-plugin-include'
import PluginManager from '../src/index.ts'
import { ExtensionManager } from '../src/extension-service.ts'
import { normalizeInstallSpec, parseInstallSpec } from '../src/install-spec.ts'
import { classifyInstallInput } from '../../../client/ui-plugin-manager/src/client/classify-install-input.ts'
import { PluginManagerController } from '../../../client/ui-plugin-manager/src/client/manager-store.ts'
import type { ConfigLedger } from '../../../client/ui-plugin-manager/src/client/config-ledger.ts'
import * as operations from '../src/operations.ts'

const RAW = 'https://www.npmjs.com/package/@liustack/modlens'
const CLEAN = '@liustack/modlens'

function ok<T>(value: T) {
  return { ok: true as const, value }
}

const NO_CONFIG: HostObservable<ConfigLedger> = {
  getSnapshot: () => ({ items: [], bundles: new Set(), rows: new Set() }),
  subscribe: () => () => {},
}

async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), 'sqh-plugin-e2e-'))
  const home = await realpath(temp)
  const dir = join(home, 'profiles', 'test')
  const anchor = join(home, 'package.json')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  writeFileSync(anchor, '{"name":"e2e","dependencies":{}}\n')
  initProfile(dir, ['core'])
  const core = join(dir, 'node_modules', 'core')
  mkdirSync(core, { recursive: true })
  writeFileSync(join(core, 'package.json'), JSON.stringify({ name: 'core', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(core, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'manager', name: 'cordis:manager', config: {} }] }]))
  const manifest = readProfileManifest('test', dir)
  manifest.dependencies = { core: '1.0.0' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  // A profile that has already decided against these optional native build scripts,
  // so pnpm installs cleanly instead of stopping at ERR_PNPM_IGNORED_BUILDS. This
  // is a normal user profile decision, not a bypass of the install path under test.
  writeFileSync(join(dir, 'pnpm-workspace.yaml'),
    'allowBuilds:\n' + ['compress-buffer', 'iconv', 'libyaml', 'pg', 'stacktrace', 'uriparser'].map(name => `  ${name}: false\n`).join(''))
  const profile: ProfileContext = {
    name: 'test',
    startedBundles: loadProfileDirectory('test', dir, anchor).layers.map(layer => layer.packageName),
    dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: anchor, cwd: home, home,
    overlays: [] as PatchOptions[], telemetryDisabledEnv: undefined,
  }
  let owner: Context | undefined
  const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), (ctx) => {
    owner = ctx
    ctx.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
    ctx.provide('profileContext', profile)
    ctx.loader.builtins.manager = PluginManager
  })
  return {
    home, dir, ctx,
    dispose: async () => { await owner?.fiber.dispose(); await rm(home, { recursive: true, force: true }) },
  }
}

/**
 * Wrap the real Host manager behind the remotes the dialog calls, so the
 * controller drives the same services the mounted GUI would reach.
 */
function gui(manager: PluginManager, home: string) {
  // The dialog asks the unified classifier before installing. Use the real
  // ExtensionManager so an npm package URL is classified, not a canned answer.
  const detector = new ExtensionManager({
    home, fetch: globalThis.fetch, token: () => undefined,
    installPlugin: vi.fn(async () => ({ location: 'unused', revision: 'x' })),
  })
  const inspect = vi.fn((...args: Parameters<typeof manager.inspect>) =>
    Promise.resolve(manager.inspect(...args)).then(value => ok(value)))
  const detectSource = vi.fn((spec: string) =>
    Promise.resolve(detector.detect(spec)).then(value => ok(value)))
  const installBundle = vi.fn((...args: Parameters<typeof manager.installBundle>) =>
    Promise.resolve(manager.installBundle(...args)).then(value => ok(value)))
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
        inspect,
        installBundle,
      },
      // detectSource answers carry ExtensionAnswer, so the Remote wrapper
      // produces a double envelope: { ok, value: { ok, value | error } }.
      extensionService: { detectSource },
    },
  } as never
  const controller = new PluginManagerController(ctx)
  onTestFinished(() => { controller.dispose() })
  const face = controller.inject(NO_CONFIG, text => typeof text === 'string' ? text : text.en)
  return { face, state: () => controller.getSnapshot(), inspect, detectSource, installBundle }
}

it.skipIf(!process.env.SQH_E2E_PLUGIN)('E2E GUI install modlens plugin from npm package page URL', async () => {
  const f = await fixture()
  try {
    // A real registry, not a stub: the whole point is to prove pnpm fetches the package.
    const registry = vi.spyOn(operations, 'readProfileRegistry').mockResolvedValue('https://registry.npmjs.org/')
    onTestFinished(() => { registry.mockRestore() })

    const g = gui(f.ctx.pluginManager, f.home)

    // Same two calls the dialog makes when the user pastes the link and clicks "安装".
    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => { expect(g.installBundle).toHaveBeenCalledOnce() }, { timeout: 60000 })
    expect(g.inspect).toHaveBeenCalledOnce()
    expect(g.detectSource).toHaveBeenCalledOnce()
    // The copied page URL must be looked up by its normalized package name.
    expect(g.inspect.mock.calls[0]?.[0]).toBe(RAW)
    // The real classifier answered "plugin", which the dialog reflects as the
    // profile package.json target before handing the spec to pnpm.
    expect(g.state().targetLocation).toContain('package.json')

    await vi.waitFor(() => {
      expect(g.state().install.phase).toBe('done')
    }, { timeout: 60000 })
    expect(g.state().install.inputError).toBeNull()
    expect(g.state().install.failure).toBeNull()
    expect(g.state().install.installed).toBe(CLEAN)

    // Confirm the real pnpm install landed on disk, not only in GUI state.
    const installed = join(f.dir, 'node_modules', '@liustack', 'modlens', 'package.json')
    expect(existsSync(installed)).toBe(true)
    const pkg = JSON.parse(await readFile(installed, 'utf8'))
    expect(pkg.name).toBe(CLEAN)
    expect(typeof pkg.version).toBe('string')
  } finally {
    await f.dispose()
  }
}, 180000)

it('classifies, normalizes and parses a copy-pasted npm package URL offline', () => {
  const classified = classifyInstallInput(RAW)
  expect(classified.kind).toBe('plugin')
  expect(normalizeInstallSpec(RAW)).toBe(CLEAN)
  expect(parseInstallSpec(RAW)).toMatchObject({ kind: 'registry', spec: CLEAN, name: CLEAN })
})
