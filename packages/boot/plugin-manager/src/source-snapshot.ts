/**
 * Read the few repository files that distinguish a plugin from a Skill or an
 * MCP server. Requests go through the Host's already-installed proxy; an
 * optional token is attached to API calls only and never reaches a child
 * process. A failed or unreadable source returns undefined so detection falls
 * back to URL shape instead of breaking an install that used to work.
 * @module @liusiqi-dev/sqh-plugin-manager/source-snapshot
 */

import { githubParts, type SourceSnapshot } from './source-detector.ts'

/** Injectable network seams for tests. */
export interface SnapshotOptions {
  readonly fetch?: typeof fetch
  readonly token?: () => string | undefined
  readonly apiBase?: string
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

const API_BASE = 'https://api.github.com'
const TIMEOUT_MS = 20_000
const MAX_PATHS = 500
const MAX_FILE_BYTES = 64 * 1024

/**
 * Read one small text file, or undefined when absent, too large or unreadable.
 */
async function readFileAt(
  get: typeof fetch, base: string, headers: Record<string, string>,
  owner: string, repo: string, ref: string, path: string,
): Promise<string | undefined> {
  const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
  try {
    const response = await get(url, { headers: { ...headers, accept: 'application/vnd.github.raw+json' }, redirect: 'error' })
    if (!response.ok) return undefined
    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > MAX_FILE_BYTES) return undefined
    return await response.text()
  } catch { return undefined }
}

/**
 * Fetch a repository tree and the manifests that decide its kind.
 * @param raw - the original install input.
 * @param options - injected fetch/token/endpoint for tests.
 */
export async function readSourceSnapshot(raw: string, options: SnapshotOptions = {}): Promise<SourceSnapshot | undefined> {
  const parts = githubParts(raw)
  if (parts === undefined) return undefined
  const get = options.fetch ?? globalThis.fetch
  const base = (options.apiBase ?? API_BASE).replace(/\/+$/, '')
  const ref = parts.ref ?? 'HEAD'
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  const token = (options.token ?? (() => process.env.GITHUB_TOKEN))()?.trim()
  if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS)
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted === true) controller.abort()
  try {
    const treeUrl = `${base}/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`
    const response = await get(treeUrl, { headers, redirect: 'error', signal: controller.signal })
    if (!response.ok) return undefined
    const answer: unknown = await response.json()
    if (typeof answer !== 'object' || answer === null || !Array.isArray((answer as { tree?: unknown }).tree)) return undefined
    const tree = (answer as { tree: { path?: unknown; type?: unknown }[] }).tree
    const paths = tree
      .filter(entry => entry.type === 'blob' && typeof entry.path === 'string' && !String(entry.path).includes('/node_modules/'))
      .map(entry => String(entry.path))
      .slice(0, MAX_PATHS)
    const wanted = [
      ...paths.filter(path => /(?:^|\/)SKILL\.md$/i.test(path)).slice(0, 3),
      ...paths.filter(path => /(?:^|\/)(?:\.mcp\.json|mcp\.json|mcp-servers\.json|cordis\.patch\.ya?ml)$/i.test(path)).slice(0, 8),
      ...paths.filter(path => path === 'package.json').slice(0, 1),
    ]
    const unique = [...new Set(wanted)]
    const files: Record<string, string | undefined> = {}
    await Promise.all(unique.map(async (path) => {
      files[path] = await readFileAt(get, base, headers, parts.owner, parts.repo, ref, path)
    }))
    return { paths, files }
  } catch { return undefined }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
