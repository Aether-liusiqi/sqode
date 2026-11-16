/**
 * Decide which installed bundles have a newer release, then install exact
 * versions through the manager's existing install path.
 *
 * This module owns no transport and no downloader: registry versions come from
 * `viewProfilePackage` (which already carries registry fallbacks), GitHub
 * versions from `resolveGithubTarball` (the REST path added for installs), and
 * an update is applied by handing an exact spec to `installBundle`. Caching and
 * in-flight sharing keep a UI with several panels from asking twice.
 * @module @liusiqi-dev/sqh-plugin-manager/update-checker
 */

import semver from 'semver'
import { parseGithubRepository, resolveGithubTarball } from './github-api.ts'
import type { BundleInfo, PluginUpdateInfo } from './types.ts'

/** Read the installed version of one bundle. */
export interface InstalledBundle {
  readonly name: string
  readonly version?: string
  /** The saved dependency spec, used to tell a registry package from a GitHub one. */
  readonly dependency: string
}

/** The seams a caller supplies: lookup, resolution, application. Injected so tests stay local. */
export interface UpdateCheckerPorts {
  /** Ask a registry for a package's latest version, or undefined when it cannot answer. */
  readonly viewLatest: (name: string) => Promise<string | undefined>
  /** Resolve a GitHub repository's current commit, or undefined when it cannot answer. */
  readonly resolveGithub: (dependency: string) => Promise<{ sha: string; spec: string } | undefined>
  /** Apply one exact spec through the existing install path. */
  readonly install: (spec: string) => Promise<unknown>
}

/** Cache lifetime for one check result. */
const CACHE_MS = 5 * 60 * 1000

/**
 * Compare the latest version with the installed one. A GitHub dependency is
 * compared by commit SHA: a different SHA means a newer release, and the
 * resolved tarball spec is what upgrades it.
 */
export function updateFor(
  bundle: InstalledBundle, latestVersion: string | undefined,
  github?: { sha: string; spec: string },
): PluginUpdateInfo | undefined {
  if (latestVersion === undefined && github === undefined) return undefined
  if (github !== undefined) {
    if (bundle.version === github.sha) return undefined
    return { name: bundle.name, currentVersion: bundle.version ?? 'unknown', latestVersion: github.sha, source: 'github', spec: github.spec }
  }
  const current = bundle.version
  const latest = latestVersion as string
  if (current === undefined || semver.valid(current) === null || semver.valid(latest) === null) return undefined
  if (!semver.gt(latest, current)) return undefined
  return { name: bundle.name, currentVersion: current, latestVersion: latest, source: 'registry', spec: `${bundle.name}@${latest}` }
}

/** Whether a saved dependency spec names a GitHub repository rather than a registry package. */
export function isGithubDependency(dependency: string): boolean {
  return parseGithubRepository(dependency) !== undefined
}

/**
 * Build a checker with a five-minute cache and shared in-flight checks.
 * @param ports - the lookup and apply seams, normally bound to the manager.
 */
export function createUpdateChecker(ports: UpdateCheckerPorts) {
  let cached: { at: number; value: readonly PluginUpdateInfo[] } | undefined
  let inFlight: Promise<readonly PluginUpdateInfo[]> | undefined

  /** Ask every installed bundle in turn; one unreachable source does not hide the others. */
  const collect = async (bundles: readonly InstalledBundle[]): Promise<readonly PluginUpdateInfo[]> => {
    const results: PluginUpdateInfo[] = []
    for (const bundle of bundles) {
      const update = isGithubDependency(bundle.dependency)
        ? updateFor(bundle, undefined, await ports.resolveGithub(bundle.dependency))
        : updateFor(bundle, await ports.viewLatest(bundle.name))
      if (update !== undefined) results.push(update)
    }
    return results
  }

  return {
    /** Read available updates, reusing a fresh result or an in-flight check. */
    checkUpdates(bundles: readonly InstalledBundle[]): Promise<readonly PluginUpdateInfo[]> {
      if (cached !== undefined && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.value)
      if (inFlight !== undefined) return inFlight
      inFlight = collect(bundles).then((value) => {
        cached = { at: Date.now(), value }
        return value
      }).finally(() => { inFlight = undefined })
      return inFlight
    },
    /** Apply one exact update, then forget the cache so the next check sees the new version. */
    async applyUpdate(update: PluginUpdateInfo): Promise<unknown> {
      const result = await ports.install(update.spec)
      cached = undefined
      return result
    },
    /** Drop a cached answer, e.g. after a manual install changed the profile. */
    invalidate(): void { cached = undefined },
  }
}

/** Bind the checker's GitHub lookup to the same REST resolver installs use. */
export function githubUpdateLookup(): (dependency: string) => Promise<{ sha: string; spec: string } | undefined> {
  return async (dependency) => {
    const repository = parseGithubRepository(dependency)
    if (repository === undefined) return undefined
    const result = await resolveGithubTarball(repository)
    return result.ok ? { sha: result.value.sha, spec: result.value.spec } : undefined
  }
}

/** Adapt the manager's own bundle list to the checker's minimal installed view. */
export function installedFromBundles(bundles: readonly BundleInfo[], dependencies: Readonly<Record<string, string>>): InstalledBundle[] {
  return bundles.filter(bundle => bundle.installed).map(bundle => ({
    name: bundle.name,
    ...bundle.version === undefined ? {} : { version: bundle.version },
    dependency: dependencies[bundle.name] ?? bundle.name,
  }))
}
