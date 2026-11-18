/**
 * Resolve a GitHub repository through its REST API so installation does not
 * depend on the Git transport being reachable from the desktop process.
 *
 * Requests go through `proxyFetch` from `sqh-http-proxy` rather than the global
 * `fetch`: Electron's main process ships its own older undici, which rejects the
 * dispatcher that package installs from npm undici, so a global `fetch` fails
 * once a proxy is active. A token, when the person supplied one in GITHUB_TOKEN,
 * is attached to these API calls only: the package-manager child never inherits
 * it (`scrubbedParentEnv`), which keeps it out of install logs and snapshots.
 *
 * What this module produces is an ordinary tarball spec. The caller hands that
 * to the existing `runPnpm` path, so retries, file restoration, progress
 * events, build approvals and bundle activation stay in one implementation.
 * @module @liusiqi-dev/sqh-plugin-manager/github-api
 */

import { proxyFetch } from '@liusiqi-dev/sqh-http-proxy'
import { classifyInstallFailure } from './install-failure.ts'
import type { PackageResult } from './types.ts'

/** The REST endpoint, overridable in tests. */
const API_BASE = 'https://api.github.com'

/** Bound on one metadata answer; a repository tarball is streamed with its own cap. */
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

/** A GitHub URL this module can resolve, already normalised to owner and repository. */
export interface GithubRepository {
  readonly owner: string
  readonly repo: string
  /** A ref from a `#ref` fragment or a `/tree/<ref>` suffix, when one was given. */
  readonly ref?: string
}

/** What a successful resolution hands to the installer. */
export interface GithubResolution {
  /** The codeload tarball URL, used verbatim as a pnpm spec. */
  readonly spec: string
  /** `owner/repo@ref`, for diagnostics and the UI's source label. */
  readonly source: string
  /** The commit SHA the ref resolved to. */
  readonly sha: string
}

/** Deadline and size settings for one resolution. */
export interface GithubApiOptions {
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly signal?: AbortSignal
  /** Token source, injectable in tests; defaults to the process environment. */
  readonly token?: () => string | undefined
  /** Endpoint, injectable in tests; defaults to api.github.com. */
  readonly apiBase?: string
  /** Request function, injectable in tests; defaults to the proxy-aware fetch. */
  readonly fetch?: typeof fetch
}

/**
 * Read owner/repo/ref from a GitHub repository URL or shorthand.
 * Mirrors the forms `parseInstallSpec` already accepts as `git`, so a spec
 * that reached this module is one the installer considered a repository.
 * @param spec - the raw install spec.
 * @returns the repository parts, or undefined for a host or form not handled here.
 */
export function parseGithubRepository(spec: string): GithubRepository | undefined {
  const raw = spec.trim()
  if (raw === '') return undefined
  const noFragment = raw.replace(/#.*$/s, '')
  const tree = /\/tree\/([^/]+)/i.exec(noFragment)
  const withoutTree = tree === null ? noFragment : noFragment.slice(0, tree.index)
  const candidate = withoutTree
    .replace(/^github:/i, 'https://github.com/')
    .replace(/^gist:/i, 'https://gist.github.com/')
    .replace(/^git\+/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'gist.github.com' && !host.endsWith('.github.com')) return undefined
  const parts = url.pathname.split('/').filter(part => part !== '')
  if (parts.length !== 2) return undefined
  const [owner, repo] = parts as [string, string]
  const fromFragment = /#(.+)$/s.exec(raw)?.[1]
  const ref = fromFragment ?? tree?.[1]
  return { owner, repo, ...ref === undefined || ref === '' ? {} : { ref } }
}

/** A refusal shaped like the package-manager's own result, for the existing failure UI. */
function refusal(output: string, timedOut: boolean, logPath: string): PackageResult {
  return {
    exitCode: 1, output, truncated: false, logPath,
    kind: classifyInstallFailure({ log: output, timedOut }),
    ...timedOut ? { timedOut: true } : {},
  }
}

/**
 * Ask the API which commit a ref names, then build a codeload tarball URL.
 * No bytes are downloaded here: pnpm fetches the tarball with its own proxy
 * settings, which the desktop Host already configures for child processes.
 * @param repository - owner, repository and optional ref.
 * @param options - deadline, endpoint, token source and cancellation.
 * @returns the tarball spec and the resolved commit, or a classified failure.
 */
export async function resolveGithubTarball(
  repository: GithubRepository, options: GithubApiOptions = {},
): Promise<{ ok: true; value: GithubResolution } | { ok: false; error: PackageResult }> {
  const { apiBase = API_BASE, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = options
  const ref = repository.ref ?? 'HEAD'
  const endpoint = `${apiBase.replace(/\/+$/, '')}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/commits/${encodeURIComponent(ref)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = (): void => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted === true) controller.abort()
  try {
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
    const token = (options.token ?? (() => process.env.GITHUB_TOKEN))()?.trim()
    if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`
    const request = options.fetch ?? proxyFetch
    const response = await request(endpoint, { headers, redirect: 'error', signal: controller.signal })
    if (!response.ok) {
      const output = `GitHub API answered ${String(response.status)} for ${repository.owner}/${repository.repo}@${ref}`
      return { ok: false, error: refusal(output, false, endpoint) }
    }
    const size = Number(response.headers.get('content-length') ?? '0')
    if (size > maxBytes) {
      return { ok: false, error: refusal(`GitHub API answer exceeds ${String(maxBytes)} bytes`, false, endpoint) }
    }
    const answer: unknown = await response.json()
    if (typeof answer !== 'object' || answer === null || typeof (answer as { sha?: unknown }).sha !== 'string') {
      return { ok: false, error: refusal('GitHub API answered no commit SHA', false, endpoint) }
    }
    const sha = (answer as { sha: string }).sha
    const spec = `https://codeload.github.com/${repository.owner}/${repository.repo}/tar.gz/${sha}`
    return { ok: true, value: { spec, source: `${repository.owner}/${repository.repo}@${sha}`, sha } }
  } catch (error) {
    const timedOut = controller.signal.aborted && options.signal?.aborted !== true
    const output = timedOut
      ? `GitHub API timed out after ${String(timeoutMs)}ms`
      : `GitHub API request failed: ${error instanceof Error ? error.message : String(error)}`
    return { ok: false, error: refusal(output, timedOut, endpoint) }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
