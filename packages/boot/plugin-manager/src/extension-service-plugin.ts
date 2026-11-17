/**
 * Cordis entry for the unified extension service.
 *
 * Loader constructs plugin rows with `(ctx, config)`; this thin wrapper builds
 * the service from the seams the profile boot provides, so the service itself
 * stays independent of how it is wired and keeps the same shape as other
 * plugin-manager entry points.
 * @module @liusiqi-dev/sqh-plugin-manager/extension-service-plugin
 */

import type { Context } from '@liusiqi-dev/cordis'
import { ExtensionService, type ExtensionServiceSeams } from './extension-service.ts'

/** Cordis applies this module with the context once dependencies are ready. */
export function apply(ctx: Context): ExtensionService {
  const seams = ctx.get('extensionServiceSeams') as ExtensionServiceSeams | undefined
  if (seams === undefined) throw new Error('extensionServiceSeams was not provided by the profile boot')
  return new ExtensionService(ctx, seams)
}

export default apply
