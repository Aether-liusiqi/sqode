/**
 * Which registries one package operation asks, in order, and what a failed
 * attempt could not reach. A registry is asked with pnpm's `--registry`;
 * `null` is the one pnpm's own configuration names. This module runs in the
 * browser too, through the package's `./registry` entry, so the dialog and
 * the Host follow one rule.
 * @module @liusiqi-dev/sqh-plugin-manager/registry
 */

import type { ParsedInstallSpec } from './install-spec.ts'
import type { PluginInstallFailureKind, PluginRegistries, Registry } from './types.ts'

/** npm's own registry: what pnpm names without any configuration, and the one public registry a plan trusts as such. */
export const OFFICIAL_NPM_REGISTRY = 'https://registry.npmjs.org/'

/** Public npmmirror URL shared by the fallback configuration and public-registry comparison. */
export const NPMMIRROR_REGISTRY = 'https://registry.npmmirror.com/'

/** An http(s) URL, as pnpm's `--registry` takes it. */
export const REGISTRY_URL = /^https?:\/\/\S+$/

/** Hosts whose two-segment URLs name a repository page, never package metadata. */
const REPOSITORY_HOSTS: ReadonlySet<string> = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com'])

/**
 * Whether a typed address is an npm registry rather than a repository page.
 *
 * `REGISTRY_URL` only checks the protocol, so a repository address such as
 * `https://github.com/owner/repo` passes it — and then pnpm asks that host for
 * `/<owner>/<repo>/-/npm/v1/...`, which fails every dependency and retries until
 * the run dies. A repository page is at least two path segments on a known code
 * host; a registry there lives on a dedicated subdomain and is still accepted.
 * @param url - the address someone typed into the custom registry field.
 * @returns whether the address can serve package metadata.
 */
export function isRegistryAddress(url: string): boolean {
  if (!REGISTRY_URL.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const segments = parsed.pathname.split('/').filter(segment => segment !== '')
  // A package website's browse path (/package/<name>, /-/...) is not a registry
  // endpoint, even when its host is not a known code host.
  if (segments.includes('package') || segments.includes('-')) return false
  if (!REPOSITORY_HOSTS.has(parsed.hostname.toLowerCase())) return true
  return segments.length < 2
}

/**
 * Parse a registry URL into the form pnpm compares registries in: lower-case host, trailing slash.
 * @param url - the registry as configured or requested.
 * @returns the normalized URL.
 * @throws {Error} for anything but an http(s) URL.
 */
export function normalizeRegistry(url: string): string {
  let parsed: URL | undefined
  try { parsed = new URL(url) }
  catch { /* named below: only an http(s) URL is a registry */ }
  if (parsed === undefined || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new Error(`a registry must be an http(s) URL: ${url}`)
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/'
  return parsed.href
}

/**
 * The registries one operation asks, first to last.
 *
 * The configured set is the configured first registry and the fallbacks; a
 * requested registry is asked first when it is one of them, alone otherwise,
 * so a private registry never falls through to a public one. pnpm's own
 * registry (`null`) belongs to the set only when what it names is known to
 * be public: npm's own registry or one of the configured fallbacks. While it
 * names anything else, or is unknown, it is asked alone, and a public
 * registry asked instead never falls back into it. A registry pnpm's own
 * configuration already names is asked once.
 * @param requested - the caller's registry; undefined defers to the configured first one.
 * @param configured - the configured first registry, the fallbacks after it, and what pnpm's own configuration names.
 * @returns the registries to ask, in order; never empty.
 */
export function registryPlan(requested: Registry | undefined, configured: PluginRegistries): Registry[] {
  const own = configured.resolved === null ? null : normalizeRegistry(configured.resolved)
  const fallbacks = configured.fallbackRegistries.map(normalizeRegistry)
  const ownIsPublic = own !== null && (own === OFFICIAL_NPM_REGISTRY || fallbacks.includes(own))
  // What a registry is compared as: pnpm's own registry stands for the URL it names, once that is known.
  const keyOf = (registry: Registry): string | null => registry === null ? own : normalizeRegistry(registry)
  const known: Registry[] = []
  const keys: (string | null)[] = []
  for (const registry of [configured.registry, ...configured.fallbackRegistries]) {
    if (registry === null && !ownIsPublic) continue
    const key = keyOf(registry)
    if (keys.includes(key)) continue
    known.push(registry === null ? null : normalizeRegistry(registry))
    keys.push(key)
  }
  const first = requested === undefined ? configured.registry : requested
  const firstKey = keyOf(first)
  const normalizedFirst = first === null ? null : normalizeRegistry(first)
  // A private or unknown registry of pnpm's own, whichever way it was asked for, is asked alone.
  if ((first === null || firstKey === own) && !ownIsPublic) return [normalizedFirst]
  if (!keys.includes(firstKey)) return [normalizedFirst]
  return [normalizedFirst, ...known.filter((_registry, index) => keys[index] !== firstKey)]
}

/** The failures after which another registry can answer differently: this one was unreachable, or its copy may be stale. */
const NEXT_REGISTRY_KINDS: ReadonlySet<PluginInstallFailureKind> = new Set(['network', 'timeout', 'not-found', 'no-matching-version'])

/** A line of pnpm or git output that reports a failure, as opposed to a warning or progress line. */
const ERROR_LINE = /ERR_|ERROR|\berror\b|fatal:|Could not resolve|unable to access|ssh:|\bE[A-Z]{4,}\b/

/**
 * What a failed attempt could not reach or get an answer from.
 * @param kind - how the attempt failed.
 * @param log - what the attempt printed.
 * @param spec - the spec the attempt installed.
 * @returns `registry` for a failure another registry can change; `spec-host` when an error line names the host a git
 * or tarball spec is fetched from, which no registry stands in for; `other` for a failure neither explains.
 */
export function attributeFailure(kind: PluginInstallFailureKind, log: string, spec: ParsedInstallSpec): 'registry' | 'spec-host' | 'other' {
  if (!NEXT_REGISTRY_KINDS.has(kind)) return 'other'
  const host = spec.kind === 'git' || spec.kind === 'tarball' ? spec.host?.toLowerCase() : undefined
  if (host === undefined) return 'registry'
  const named = log.split('\n').some(line => ERROR_LINE.test(line) && line.toLowerCase().includes(host))
  return named ? 'spec-host' : 'registry'
}
