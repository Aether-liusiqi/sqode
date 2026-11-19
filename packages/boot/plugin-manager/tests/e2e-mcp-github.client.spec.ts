/**
 * End-to-end test for the GUI MCP install chain.
 *
 * This drives the exact chain the install button uses:
 *   PluginManagerController.inject() face
 *     -> editInstallSpec() -> runInstall()
 *     -> classifyInstallInput() -> startExtensionInstall()
 *     -> remote.extensionService.installExtension()
 *     -> real ExtensionManager.install()
 *     -> installExtension('mcp') -> writeMcpServer() -> cordis.patch.yml
 *
 * Four cases:
 *   1. A controlled repository whose .mcp.json uses the ecosystem's standard
 *      mcpServers object proves the full success path and the normalization
 *      into Sqode's flat config, including the file written on disk.
 *   2. A controlled repository that documents its config only in the README
 *      proves the README fallback that real external MCP repos rely on.
 *   3. A live probe against a real, high-traffic MCP repository is gated behind
 *      SQH_E2E_MCP so the regular suite never touches the network. It now
 *      requires the install to succeed from the repo's own README.
 *   4. An offline regression proves a repository read failure is surfaced
 *      through the GUI as an extension-install error, not a silent no-op.
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

// A real, high-traffic MCP server repository. Used by both the controlled
// fixtures (with an injected config) and the live probe (with what the repo
// actually ships).
const REPO = 'https://github.com/microsoft/playwright-mcp'
const RAW = `mcp：${REPO}`
const CLEAN = REPO

// The ecosystem's standard mcpServers object, as shipped by external MCP repos.
// The installer must normalize this into Sqode's flat config before writing the patch.
const COMPLIANT_CONFIG = {
  mcpServers: {
    playwright: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
  },
}

// Some external repos document their config only in the README, with no .mcp.json.
// This is the exact shape found in microsoft/playwright-mcp.
const README_WITH_CONFIG = `# Playwright MCP

## Standard Configuration

\`\`\`json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
\`\`\`
`

function ok<T>(value: T) {
  return { ok: true as const, value }
}

const NO_CONFIG: HostObservable<ConfigLedger> = {
  getSnapshot: () => ({ items: [], bundles: new Set(), rows: new Set() }),
  subscribe: () => () => {},
}

type InstallRequest = import('../src/types.ts').ExtensionInstallRequest

/** A GitHub API fetch answering with a repo carrying one standard-format .mcp.json. */
const fixtureFetch = ((input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes('/git/trees/')) {
    return Promise.resolve(new Response(
      JSON.stringify({ tree: [{ path: '.mcp.json', type: 'blob' }] }),
      { status: 200 },
    ))
  }
  if (url.includes('/contents/.mcp.json')) {
    return Promise.resolve(new Response(JSON.stringify(COMPLIANT_CONFIG), { status: 200 }))
  }
  return Promise.resolve(new Response('{}', { status: 404 }))
}) as unknown as typeof fetch

/** A GitHub API fetch for a repo that documents its config only in the README. */
const readmeFetch = ((input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes('/git/trees/')) {
    return Promise.resolve(new Response(
      JSON.stringify({ tree: [{ path: 'README.md', type: 'blob' }] }),
      { status: 200 },
    ))
  }
  if (url.includes('/contents/README.md')) {
    return Promise.resolve(new Response(README_WITH_CONFIG, { status: 200 }))
  }
  return Promise.resolve(new Response('{}', { status: 404 }))
}) as unknown as typeof fetch

// A repo shipping several servers in one mcpServers object. One typed install
// must write and register every server, not just the first one.
const MULTI_CONFIG = {
  mcpServers: {
    alpha: { command: 'npx', args: ['-y', '@scope/alpha'] },
    beta: { command: 'node', args: ['beta-server.js'] },
    gamma: { url: 'https://gamma.example.com/mcp' },
  },
}
const multiFetch = ((input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes('/git/trees/')) {
    return Promise.resolve(new Response(
      JSON.stringify({ tree: [{ path: '.mcp.json', type: 'blob' }] }),
      { status: 200 },
    ))
  }
  if (url.includes('/contents/.mcp.json')) {
    return Promise.resolve(new Response(JSON.stringify(MULTI_CONFIG), { status: 200 }))
  }
  return Promise.resolve(new Response('{}', { status: 404 }))
}) as unknown as typeof fetch

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

it('installs an MCP server from a repository through the full GUI chain', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-mcp-gui-e2e-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: fixtureFetch,
      token: () => undefined,
      installPlugin: vi.fn(async () => ({ location: 'unused', revision: 'x' })),
    })
    const g = gui(manager)

    // Same two calls the dialog makes when the user types the prefixed link
    // and clicks 安装.
    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => { expect(g.installExtension).toHaveBeenCalledOnce() }, { timeout: 15000 })
    // The GUI marked the MCP channel busy before crossing the wire.
    expect(g.busy()).toBe('mcp')
    expect(g.installExtension).toHaveBeenCalledWith({ spec: CLEAN, hint: 'mcp' })

    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
      expect(g.state().notice?.kind).toBe('updated')
    }, { timeout: 15000 })

    expect(g.state().install.inputError).toBeNull()
    expect(g.state().targetLocation).toContain('profiles')

    // Confirm the real MCP registration landed on disk, not only in GUI state.
    const list = await manager.list('mcp')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'mcp', name: 'playwright' })
    const patch = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
    expect(existsSync(patch)).toBe(true)
    const text = await readFile(patch, 'utf8')
    expect(text).toContain('id: mcp-playwright')
    expect(text).toContain('serverName: playwright')
    expect(text).toContain('transport: stdio')
    expect(text).toContain('command: npx')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('installs every server in a multi-server config through the full GUI chain', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-mcp-gui-multi-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: multiFetch,
      token: () => undefined,
      installPlugin: vi.fn(),
    })
    const g = gui(manager)

    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => { expect(g.installExtension).toHaveBeenCalledOnce() }, { timeout: 15000 })
    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
      expect(g.state().notice?.kind).toBe('updated')
    }, { timeout: 15000 })

    // One install wrote and registered all three servers, not just the first.
    const list = await manager.list('mcp')
    expect(list.map(record => record.name).sort()).toEqual(['alpha', 'beta', 'gamma'])
    const patch = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
    const text = await readFile(patch, 'utf8')
    expect(text).toContain('id: mcp-alpha')
    expect(text).toContain('id: mcp-beta')
    expect(text).toContain('id: mcp-gamma')
    expect(text).toContain('serverName: gamma')
    expect(text).toContain('transport: streamable-http')
    expect(text).toContain('url: https://gamma.example.com/mcp')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('installs an MCP server whose config lives only in the README through the full GUI chain', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-mcp-gui-readme-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: readmeFetch,
      token: () => undefined,
      installPlugin: vi.fn(),
    })
    const g = gui(manager)

    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
      expect(g.state().notice?.kind).toBe('updated')
    }, { timeout: 15000 })

    expect(g.state().install.inputError).toBeNull()
    expect(g.installExtension).toHaveBeenCalledWith({ spec: CLEAN, hint: 'mcp' })

    // The flat config was derived from the README's fenced JSON block, not a manifest file.
    const list = await manager.list('mcp')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'mcp', name: 'playwright' })
    const patch = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
    const text = await readFile(patch, 'utf8')
    expect(text).toContain('id: mcp-playwright')
    expect(text).toContain('serverName: playwright')
    expect(text).toContain('transport: stdio')
    expect(text).toContain('command: npx')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it.skipIf(!process.env.SQH_E2E_MCP)('live probe: route a real MCP repository through the GUI chain', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-mcp-gui-live-'))
  try {
    const manager = new ExtensionManager({
      home,
      fetch: globalThis.fetch,
      token: () => process.env.GITHUB_TOKEN,
      installPlugin: vi.fn(async () => ({ location: 'unused', revision: 'x' })),
    })
    const g = gui(manager)

    g.face.editInstallSpec(RAW)
    g.face.runInstall()

    await vi.waitFor(() => { expect(g.installExtension).toHaveBeenCalledOnce() }, { timeout: 15000 })
    expect(g.busy()).toBe('mcp')
    expect(g.installExtension).toHaveBeenCalledWith({ spec: CLEAN, hint: 'mcp' })

    await vi.waitFor(() => {
      expect(g.state().install.extensionInstalling).toBeUndefined()
    }, { timeout: 60000 })

    const notice = g.state().notice
    const reason = g.state().install.inputError?.reason
    console.log(`[MCP live] repo=${CLEAN} notice=${notice?.kind} reason=${reason ?? 'none'}`)
    // The point of the compatibility fix: a real external MCP repo documents
    // its config in the README and must now install successfully from it.
    expect(notice?.kind).toBe('updated')
    const patch = join(home, 'profiles', 'desktop', 'cordis.patch.yml')
    expect(existsSync(patch)).toBe(true)
    const text = await readFile(patch, 'utf8')
    expect(text).toContain('id: mcp-')
    expect(text).toContain('transport:')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}, 120000)

it('surfaces a repository read failure through the GUI as an extension-install error', async () => {
  const home = await mkdtemp(join(tmpdir(), 'sqh-mcp-gui-net-'))
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
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
