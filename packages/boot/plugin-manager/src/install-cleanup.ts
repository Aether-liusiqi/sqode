/**
 * Remove only the temporary directories one failed or cancelled install
 * created. Cache files under a pnpm store's `files/` are shared, reusable
 * content and are deliberately left alone; so is a successful run's own
 * cleanup, which pnpm performs itself.
 *
 * Two roots are snapshotted before an install: the profile's diagnostic log
 * root and pnpm's `tmp` directory. After a failed or cancelled run, entries
 * not present in the earlier snapshot are removed. A root that cannot be read
 * is skipped: cleanup must never turn an install failure into a worse one.
 * @module @liusiqi-dev/sqh-plugin-manager/install-cleanup
 */

import { readFileSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** The roots a single install may create new directories under. */
export interface CleanupRoots {
  /** Profile diagnostics: `.plugin-manager/logs`, containing `operation-*` and `github-connection-*` dirs. */
  readonly logs: string
  /** pnpm store's `tmp`, containing `_tmp_*` unpack directories. */
  readonly pnpmTmp?: string
}

/** Directory names observed before an install began. */
export interface CleanupSnapshot {
  readonly roots: readonly { readonly path: string; readonly names: ReadonlySet<string> }[]
}

/**
 * Read the child directory names of each path that exists. Missing or
 * unreadable paths are recorded as empty so a later snapshot cannot mistake a
 * newly created root for a set of files to delete.
 */
export async function snapshotCleanupRoots(roots: CleanupRoots): Promise<CleanupSnapshot> {
  const paths = [roots.logs, ...roots.pnpmTmp === undefined ? [] : [roots.pnpmTmp]]
  const seen = await Promise.all(paths.map(async (path) => {
    try {
      const names = await readdir(path, { withFileTypes: true })
      return { path, names: new Set(names.filter(name => name.isDirectory()).map(name => name.name)) }
    } catch {
      return { path, names: new Set<string>() }
    }
  }))
  return { roots: seen }
}

/**
 * Remove only directories that appeared under a snapshotted root. Files and
 * pre-existing directories are untouched, and every removal is best-effort:
 * a locked temporary directory may be retried on the next failed install.
 * @returns the directory names that were removed.
 */
export async function cleanupNewTempDirs(snapshot: CleanupSnapshot): Promise<readonly string[]> {
  const removed: string[] = []
  for (const root of snapshot.roots) {
    let current: string[]
    try {
      const entries = await readdir(root.path, { withFileTypes: true })
      current = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch {
      continue
    }
    for (const name of current) {
      if (root.names.has(name)) continue
      try {
        await rm(join(root.path, name), { recursive: true, force: true })
        removed.push(name)
      } catch { /* a locked directory is left for a later cleanup */ }
    }
  }
  return removed
}

/** The diagnostics root a profile's operations write to. */
export function profileLogRoot(profileDir: string): string {
  return join(profileDir, '.plugin-manager', 'logs')
}

/**
 * Candidate pnpm store `tmp` directories, from the profile's `.npmrc` when it
 * names one and otherwise pnpm's default per-platform locations. Only paths
 * that exist are returned; a missing store means there is nothing to clean.
 * @param profileDir - the profile whose `.npmrc` may override the store.
 * @param env - environment of the pnpm child, used for XDG/LOCALAPPDATA.
 */
export function pnpmTmpCandidates(profileDir: string, env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const candidates: string[] = []
  const npmrc = join(profileDir, '.npmrc')
  try {
    // pnpm accepts both `store-dir=...` and `store-dir ...`; only simple lines are read.
    const text = readFileSync(npmrc, 'utf8')
    const match = /^\s*store-dir\s*[=:]\s*(.+?)\s*$/m.exec(text)
    if (match?.[1] !== undefined) candidates.push(join(match[1].replace(/^['"]|['"]$/g, ''), 'v11', 'tmp'))
  } catch { /* no .npmrc or unreadable: use the platform defaults */ }
  const home = env.HOME ?? env.USERPROFILE
  if (env.XDG_DATA_HOME !== undefined) candidates.push(join(env.XDG_DATA_HOME, 'pnpm', 'store', 'v11', 'tmp'))
  if (env.LOCALAPPDATA !== undefined) candidates.push(join(env.LOCALAPPDATA, 'pnpm', 'store', 'v11', 'tmp'))
  if (home !== undefined) {
    candidates.push(join(home, '.local', 'share', 'pnpm', 'store', 'v11', 'tmp'))
    candidates.push(join(home, 'Library', 'pnpm', 'store', 'v11', 'tmp'))
  }
  return candidates
}

/** Pick the first existing pnpm store tmp directory, if any. */
export async function resolvePnpmTmp(candidates: readonly string[]): Promise<string | undefined> {
  for (const path of candidates) {
    try {
      if ((await stat(path)).isDirectory()) return path
    } catch { /* try the next candidate */ }
  }
  return undefined
}
