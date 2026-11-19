/**
 * Remote façade for the unified extension manager.
 *
 * The detector, installer and inventory are deliberately independent modules;
 * this service wires them once and exposes them to the client. It injects the
 * plugin installer rather than owning pnpm, so the long-standing install path
 * (progress, cancellation, build approvals, restoration) stays in one place.
 * @module @liusiqi-dev/sqh-plugin-manager/extension-service
 */

import { TypertRemoteService, Remote } from '@liusiqi-dev/sqh-typert-protocol'
import { Context } from '@liusiqi-dev/cordis'
import z from '@liusiqi-dev/schemastery'
import { installExtension, ExtensionInstallError, readLocalSkill, uninstallExtension, type PluginInstaller } from './extension-installer.ts'
import { listExtensions } from './extension-registry.ts'
import { detectSource, githubParts, type SourceSnapshot } from './source-detector.ts'
import { readSourceSnapshot } from './source-snapshot.ts'
import type {
  ExtensionKind, ExtensionRecord, DetectedSource, SourceHint,
  McpServerConfig, ExtensionInstallResult, ExtensionInstallRequest, ExtensionFailure, ExtensionAnswer,
} from './types.ts'

/** Read a repository snapshot through this service's injected network seams. */
async function snapshotFor(
  spec: string, seams: { fetch?: typeof fetch; token?: () => string | undefined; apiBase?: string },
): Promise<SourceSnapshot | undefined> {
  return readSourceSnapshot(spec, {
    ...seams.fetch === undefined ? {} : { fetch: seams.fetch },
    ...seams.token === undefined ? {} : { token: seams.token },
    ...seams.apiBase === undefined ? {} : { apiBase: seams.apiBase },
  })
}

/** A non-empty string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** An object of string values, or undefined when nothing usable remains. */
function stringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    const item = text(entry)
    if (item !== undefined) result[key] = item
  }
  return Object.keys(result).length === 0 ? undefined : result
}

/** A string array, or undefined when empty. */
function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry): entry is string => typeof entry === 'string')
  return result.length === 0 ? undefined : result
}

/**
 * Convert Sqode's flat config and the ecosystem's `mcpServers` object into the
 * one McpServerConfig shape the installer writes. Anything it cannot interpret
 * throws, so a malformed source never lands as a broken patch row.
 */
export function normalizeMcpConfig(raw: unknown, fallbackName: string): { name: string; config: McpServerConfig } {
  if (raw === undefined) throw new ExtensionInstallError('invalid-content', 'MCP server config is required')
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ExtensionInstallError('invalid-content', 'MCP config must be a JSON object')
  }
  const root = raw as Record<string, unknown>
  let name = text(root.serverName) ?? fallbackName
  let entry = root
  const servers = root.mcpServers
  if (servers !== undefined) {
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
      throw new ExtensionInstallError('invalid-content', 'MCP mcpServers must be an object')
    }
    const keys = Object.keys(servers as Record<string, unknown>)
    const first = keys[0]
    if (first === undefined) throw new ExtensionInstallError('invalid-content', 'MCP mcpServers has no server')
    const chosen = keys.find(key => key.toLowerCase() === fallbackName.toLowerCase()) ?? first
    name = chosen
    const value = (servers as Record<string, unknown>)[chosen]
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ExtensionInstallError('invalid-content', `MCP server ${chosen} must be an object`)
    }
    entry = value as Record<string, unknown>
  }
  const command = text(entry.command)
  const url = text(entry.url)
  const type = text(entry.type)?.toLowerCase()
  const args = stringArray(entry.args)
  const env = stringRecord(entry.env)
  const headers = stringRecord(entry.headers)
  let transport: McpServerConfig['transport']
  if (type === 'stdio' || type === 'local') transport = 'stdio'
  else if (type === 'http' || type === 'sse' || type === 'streamable-http') transport = 'streamable-http'
  else if (command !== undefined) transport = 'stdio'
  else if (url !== undefined) transport = 'streamable-http'
  else throw new ExtensionInstallError('invalid-content', `MCP server ${name} needs a command or url`)
  if (transport === 'stdio') {
    if (command === undefined) throw new ExtensionInstallError('invalid-content', `MCP server ${name} needs a command for stdio`)
    return { name, config: { transport: 'stdio', command, ...args === undefined ? {} : { args }, ...env === undefined ? {} : { env } } }
  }
  if (url === undefined) throw new ExtensionInstallError('invalid-content', `MCP server ${name} needs a url for http`)
  return { name, config: { transport: 'streamable-http', url, ...headers === undefined ? {} : { headers } } }
}

/** Normalize every server in an mcpServers object, or one flat Sqode config. */
export function normalizeMcpConfigs(raw: unknown, fallbackName: string): readonly { name: string; config: McpServerConfig }[] {
  if (raw !== undefined && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const servers = (raw as Record<string, unknown>).mcpServers
    if (servers !== undefined && typeof servers === 'object' && servers !== null && !Array.isArray(servers)) {
      const entries = Object.entries(servers as Record<string, unknown>)
      if (entries.length > 0) {
        return entries.map(([name, value]) => normalizeMcpConfig({ mcpServers: { [name]: value } }, name))
      }
    }
  }
  return [normalizeMcpConfig(raw, fallbackName)]
}

/** Parse config text, reporting a bad source instead of a bare SyntaxError. */
function parseConfigText(value: string | undefined): unknown {
  if (value === undefined) return undefined
  try { return JSON.parse(value) as unknown }
  catch { throw new ExtensionInstallError('invalid-content', 'MCP config is not valid JSON') }
}

/** Find the first fenced JSON block that declares an mcpServers object. */
function mcpConfigFromReadme(readme: string | undefined): string | undefined {
  if (readme === undefined) return undefined
  for (const match of readme.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const candidate = (match[1] ?? '').trim()
    if (!candidate.includes('mcpServers')) continue
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (typeof parsed === 'object' && parsed !== null && 'mcpServers' in parsed) return candidate
    } catch { /* try the next fenced block */ }
  }
  return undefined
}

/** The injected seams one service instance owns. */
export interface ExtensionServiceSeams {
  readonly home?: string
  readonly installPlugin: PluginInstaller
  readonly fetch?: typeof fetch
  readonly token?: () => string | undefined
  readonly apiBase?: string
}

/** Framework-free implementation, so the behavior can be tested without a Cordis context. */
export class ExtensionManager {
  constructor(private readonly seams: ExtensionServiceSeams) {}

  /** List everything Sqode installed, optionally filtered by kind. */
  async list(kind?: ExtensionKind): Promise<readonly ExtensionRecord[]> {
    return listExtensions(this.seams.home, kind)
  }

  /** Classify a source before installing, including repository content when reachable. */
  async detect(spec: string, hint?: SourceHint): Promise<ExtensionAnswer<DetectedSource>> {
    try {
      const snapshot = await snapshotFor(spec, this.seams)
      return { ok: true, value: detectSource(spec, hint, snapshot) }
    } catch (error) {
      return { ok: false, error: { code: 'detection-failed', message: error instanceof Error ? error.message : String(error) } }
    }
  }

  /** Install one extension at its kind's location and record it in the inventory. */
  async install(request: ExtensionInstallRequest): Promise<ExtensionAnswer<ExtensionInstallResult>> {
    try {
      const snapshot = await snapshotFor(request.spec, this.seams)
      const detected = detectSource(request.spec, request.hint, snapshot)
      const kind = request.kind ?? detected.kind
      // A repository URL whose snapshot could not be read is a network failure.
      // Without this guard the Skill name falls back to the whole URL and
      // installExtension reports invalid-name, hiding the real cause.
      if (
        request.contents === undefined
        && snapshot === undefined
        && githubParts(request.spec) !== undefined
        && kind !== 'plugin'
      ) {
        throw Object.assign(
          new Error('无法读取这个 GitHub 仓库的内容,请检查网络连接后重试。如果是私有仓库,请先配置 GITHUB_TOKEN。'),
          { code: 'detection-failed' satisfies ExtensionFailure['code'] },
        )
      }
      // A Skill's bytes may come from the caller, the repository, or this
      // machine — the last one is what makes `skill:<local path>` work with no
      // network at all, and it also supplies the frontmatter this name needs.
      const contents = request.contents
        ?? snapshot?.files[Object.keys(snapshot?.files ?? {}).find(path => /(?:^|\/)SKILL\.md$/i.test(path)) ?? '']
        ?? (kind === 'skill' ? await readLocalSkill(detected.spec) : undefined)
      // An MCP config can come from the caller, a manifest file, or the first
      // fenced mcpServers block in a README: most external repos ship only the
      // last one. Normalize every source into Sqode's flat config shape.
      const files = snapshot?.files ?? {}
      const manifestPath = Object.keys(files).find(path => /(?:^|\/)(?:\.mcp\.json|mcp\.json|mcp-servers\.json)$/i.test(path))
      const readmePath = Object.keys(files).find(path => /^README\.md$/i.test(path))
      const configText = request.config === undefined
        ? files[manifestPath ?? ''] ?? mcpConfigFromReadme(files[readmePath ?? ''])
        : undefined
      // The inventory key is the loader's name, not the typed URL: a Skill is
      // named by its SKILL.md frontmatter, an MCP server by its config.
      let name: string
      let parsedConfig: McpServerConfig | undefined
      let mcpEntries: readonly { name: string; config: McpServerConfig }[] = []
      if (kind === 'plugin') {
        name = detected.spec
      } else if (kind === 'skill') {
        name = /^---[\s\S]*?^name\s*:\s*(.+?)\s*$/m.exec(contents ?? '')?.[1]?.replace(/^['"]|['"]$/g, '') ?? detected.spec
      } else {
        mcpEntries = normalizeMcpConfigs(
          request.config ?? parseConfigText(configText),
          detected.spec.split('/').filter(Boolean).at(-1) ?? detected.spec,
        )
        const first = mcpEntries[0]
        if (first === undefined) throw new ExtensionInstallError('invalid-content', 'MCP mcpServers has no server')
        name = first.name
        parsedConfig = first.config
      }
      const options = {
        ...this.seams.home === undefined ? {} : { home: this.seams.home },
        source: request.spec,
        installPlugin: this.seams.installPlugin,
        update: request.update === true,
        ...contents === undefined ? {} : { contents },
        ...parsedConfig === undefined ? {} : { config: parsedConfig },
      }
      const result = await installExtension(kind, name, options)
      if (kind === 'mcp' && mcpEntries.length > 1) {
        // One typed install installs every server in the config. Each entry is
        // written and registered through the same path, so the patch and the
        // inventory stay consistent with a single-server install.
        const installed: ExtensionInstallResult[] = [result]
        for (const entry of mcpEntries.slice(1)) {
          installed.push(await installExtension('mcp', entry.name, { ...options, config: entry.config }))
        }
        return { ok: true, value: { ...result, installed } }
      }
      return { ok: true, value: result }
    } catch (error) {
      const code = (error as { code?: ExtensionFailure['code'] }).code ?? 'operation-error'
      return { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } }
    }
  }

  /** Unregister and remove one extension's exact recorded path. */
  async remove(kind: ExtensionKind, name: string): Promise<boolean> {
    return uninstallExtension(this.seams.home, kind, name)
  }
}

/** Remote façade: one method per manager method, no behavior of its own. */
export class ExtensionService extends TypertRemoteService {
  static inject = ['extensionServiceSeams']
  static Config = z.object({})

  private readonly manager: ExtensionManager

  constructor(ctx: Context, seams: ExtensionServiceSeams) {
    super(ctx, 'extensionService')
    this.manager = new ExtensionManager(seams)
  }

  // Method names must not collide with RemoteNamespaceService.prototype
  // (install/remove/list/has/...): the client $mount rejects a namespace whose
  // method shadows its own service, and api-remotes then rolls back every
  // mounted namespace, leaving the whole web boot pending.
  @Remote
  listExtensions(kind?: ExtensionKind): Promise<readonly ExtensionRecord[]> { return this.manager.list(kind) }

  @Remote
  detectSource(spec: string, hint?: SourceHint): Promise<ExtensionAnswer<DetectedSource>> { return this.manager.detect(spec, hint) }

  @Remote
  installExtension(request: ExtensionInstallRequest): Promise<ExtensionAnswer<ExtensionInstallResult>> {
    return this.manager.install(request)
  }

  @Remote
  removeExtension(kind: ExtensionKind, name: string): Promise<boolean> { return this.manager.remove(kind, name) }
}
