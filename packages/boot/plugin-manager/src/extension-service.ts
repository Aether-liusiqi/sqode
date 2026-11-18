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
import { installExtension, readLocalSkill, uninstallExtension, type PluginInstaller } from './extension-installer.ts'
import { listExtensions } from './extension-registry.ts'
import { detectSource, type SourceSnapshot } from './source-detector.ts'
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
      // A Skill's bytes may come from the caller, the repository, or this
      // machine — the last one is what makes `skill:<local path>` work with no
      // network at all, and it also supplies the frontmatter this name needs.
      const contents = request.contents
        ?? snapshot?.files[Object.keys(snapshot?.files ?? {}).find(path => /(?:^|\/)SKILL\.md$/i.test(path)) ?? '']
        ?? (kind === 'skill' ? await readLocalSkill(detected.spec) : undefined)
      const configText = request.config === undefined
        ? snapshot?.files[Object.keys(snapshot?.files ?? {}).find(path => /(?:^|\/)(?:\.mcp\.json|mcp\.json)$/i.test(path)) ?? '']
        : undefined
      // The inventory key is the loader's name, not the typed URL: a Skill is
      // named by its SKILL.md frontmatter, an MCP server by its config's serverName.
      const name = kind === 'plugin'
        ? detected.spec
        : kind === 'skill'
          ? /^---[\s\S]*?^name\s*:\s*(.+?)\s*$/m.exec(contents ?? '')?.[1]?.replace(/^['"]|['"]$/g, '') ?? detected.spec
          : (JSON.parse(configText ?? '{}') as { serverName?: string }).serverName
            ?? (request.config as { serverName?: string } | undefined)?.serverName
            ?? detected.spec.split('/').filter(Boolean).at(-1) ?? detected.spec
      const parsedConfig = request.config ?? (configText === undefined ? undefined : JSON.parse(configText) as McpServerConfig)
      const result = await installExtension(kind, name, {
        ...this.seams.home === undefined ? {} : { home: this.seams.home },
        source: request.spec,
        installPlugin: this.seams.installPlugin,
        update: request.update === true,
        ...contents === undefined ? {} : { contents },
        ...parsedConfig === undefined ? {} : { config: parsedConfig },
      })
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
