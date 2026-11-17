/**
 * Classify an install source by reading its contents, not just its URL shape.
 *
 * A GitHub repository can hold a Sqode plugin bundle, a Skill directory, or an
 * MCP server definition while looking identical in the address bar. This
 * module asks the GitHub REST API for the repository tree and reads only the
 * small manifest files that distinguish the three, then returns a classification
 * with the evidence that produced it. Network access goes through the Host's
 * already-installed proxy dispatcher; a token stays in the request header and
 * never reaches a child process.
 *
 * Nothing here installs anything: the result feeds the existing per-kind
 * executors, so a probe failure simply leaves the earlier URL-shape guess in
 * place rather than breaking an install that used to work.
 * @module @liusiqi-dev/sqh-plugin-manager/install-probe
 */

import { classifyInstallTarget, type InstallTargetKind } from './install-target.ts'
import { parseGithubRepository } from './github-api.ts'

/** The evidence a probe used, for the dialog's early feedback. */
export interface ProbeEvidence {
  /** Files or fields that decided the classification. */
  readonly signals: readonly string[]
  /** The repository path whose content supplied the decisive signal. */
  readonly source?: string
}

/** A classification that may refine the URL-shape guess. */
export interface ProbeResult {
  readonly kind: InstallTargetKind
  readonly confidence: 'explicit' | 'content' | 'shape'
  readonly evidence: ProbeEvidence
}

/** Injectable fetch and token source, so tests never touch the network. */
export interface ProbeOptions {
  readonly fetch?: typeof fetch
  readonly token?: () => string | undefined
  readonly apiBase?: string
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

const API_BASE = 'https://api.github.com'
const TIMEOUT_MS = 20_000
const MAX_TREE_ENTRIES = 500

/** A file path in the repository tree that can decide the kind. */
interface TreeEntry { readonly path: string; readonly type: string }

/** Read a small text file through the contents API, or undefined when absent/unreadable. */
async function readText(
  get: typeof fetch, base: string, headers: Record<string, string>, owner: string, repo: string, ref: string, path: string,
): Promise<string | undefined> {
  const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
  try {
    const response = await get(url, { headers: { ...headers, accept: 'application/vnd.github.raw+json' }, redirect: 'error' })
    if (!response.ok) return undefined
    return await response.text()
  } catch { return undefined }
}

/**
 * Read a repository's tree and manifests, then classify by content.
 * @param spec - the original install input.
 * @param options - injected fetch/token/endpoint for tests.
 */
export async function probeInstallSource(spec: string, options: ProbeOptions = {}): Promise<ProbeResult | undefined> {
  const repository = parseGithubRepository(spec)
  if (repository === undefined) return undefined
  const get = options.fetch ?? globalThis.fetch
  const base = (options.apiBase ?? API_BASE).replace(/\/+$/, '')
  const ref = repository.ref ?? 'HEAD'
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  const token = (options.token ?? (() => process.env.GITHUB_TOKEN))()?.trim()
  if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS)
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const treeUrl = `${base}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`
    const response = await get(treeUrl, { headers, redirect: 'error', signal: controller.signal })
    if (!response.ok) return undefined
    const answer: unknown = await response.json()
    if (typeof answer !== 'object' || answer === null || !Array.isArray((answer as { tree?: unknown }).tree)) return undefined
    const entries = ((answer as { tree: TreeEntry[] }).tree)
      .filter(entry => entry.type === 'blob' && !entry.path.includes('/node_modules/'))
      .slice(0, MAX_TREE_ENTRIES)
    const paths = entries.map(entry => entry.path)

    // Skill: a SKILL.md with the loader's required frontmatter wins over a bare word in the URL.
    const skillFiles = paths.filter(path => /(?:^|\/)SKILL\.md$/i.test(path))
    for (const path of skillFiles) {
      const text = await readText(get, base, headers, repository.owner, repository.repo, ref, path)
      if (text !== undefined && /^---[\s\S]*?^name\s*:/m.test(text) && /^description\s*:/m.test(text)) {
        return { kind: 'skill', confidence: 'content', evidence: { signals: ['SKILL.md frontmatter: name + description'], source: path } }
      }
    }

    // MCP: an explicit server config file or a Cordis patch that mounts mcp-client.
    const mcpConfig = paths.find(path => /(?:^|\/)(?:\.mcp\.json|mcp\.json|mcp-servers\.json)$/i.test(path))
    if (mcpConfig !== undefined) {
      return { kind: 'mcp', confidence: 'content', evidence: { signals: ['MCP server configuration file'], source: mcpConfig } }
    }
    const patchFiles = paths.filter(path => /(?:^|\/)cordis\.patch\.ya?ml$/i.test(path))
    for (const path of patchFiles) {
      const text = await readText(get, base, headers, repository.owner, repository.repo, ref, path)
      if (text?.includes('sqh-mcp-client') === true || text?.includes('dsh-mcp-client') === true) {
        return { kind: 'mcp', confidence: 'content', evidence: { signals: ['Cordis patch mounts mcp-client'], source: path } }
      }
    }

    // Plugin: a package manifest declaring a bundle patch.
    const rootManifest = paths.find(path => path === 'package.json')
    if (rootManifest !== undefined) {
      const text = await readText(get, base, headers, repository.owner, repository.repo, ref, rootManifest)
      if (text !== undefined && /"(?:dsh|sqh)"\s*:\s*\{[\s\S]*?"bundle"\s*:/.test(text)) {
        return { kind: 'plugin', confidence: 'content', evidence: { signals: ['package.json declares dsh/sqh.bundle'], source: rootManifest } }
      }
    }

    // No decisive content: keep the shape-based answer, but say so.
    const shape = classifyInstallTarget(spec)
    if (shape.kind === 'plugin') return undefined
    return { kind: shape.kind, confidence: 'shape', evidence: { signals: ['URL shape only'] } }
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
