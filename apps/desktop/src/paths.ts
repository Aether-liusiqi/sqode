/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveSqhHome } from '@liusiqi-dev/sqh-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param sqhHome - Harness home shared with npm-installed sqh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(sqhHome: string = resolveSqhHome()): DesktopPaths {
  return {
    profile: join(sqhHome, 'profiles', 'desktop'),
    lock: join(sqhHome, 'profiles', 'desktop', 'lock'),
  }
}
