/**
 * Metaso-backed `WebSearchProvider` plugin. Contributes to the `ctx.web`
 * registry without owning the service.
 * @module @liusiqi-dev/sqh-web-search-metaso
 */

import type { Context } from '@liusiqi-dev/cordis'
import { launchEnvironmentOf } from '@liusiqi-dev/sqh-launch-environment'
import z from '@liusiqi-dev/schemastery'
import type {} from '@liusiqi-dev/sqh-web'
import { MetasoSearchProvider, METASO_DEFAULT_BASE_URL } from './provider.ts'

export {
  METASO_DEFAULT_BASE_URL,
  METASO_DEFAULT_SIZE,
  METASO_PROVIDER_ID,
  METASO_SEARCH_PATH,
  MetasoSearchProvider,
  mapMetasoResponse,
  mapMetasoWebpage,
} from './provider.ts'
export type { MetasoSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-metaso'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional; `apply` fills env-var and constant defaults). */
export interface Config {
  /** Metaso API key. Falls back to `$METASO_API_KEY`. Empty -> unavailable. */
  apiKey?: string
  /** Endpoint base; `/api/v1/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Retrieval scope sent as `scope`. Omitted = Metaso default. */
  scope?: string
  /** Ask Metaso for a model summary instead of a raw snippet. Defaults to true. */
  includeSummary?: boolean
  /** Ask Metaso for a concise snippet. Defaults to false. */
  conciseSnippet?: boolean
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  scope: z.string(),
  includeSummary: z.boolean(),
  conciseSnippet: z.boolean(),
})

/** Register the Metaso search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new MetasoSearchProvider({
    // Key is read from the launch environment (which includes the user-scope
    // METASO_API_KEY set in the OS) or explicit config. Never hardcoded.
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get('METASO_API_KEY')?.value ?? '',
    baseURL: config.baseURL ?? METASO_DEFAULT_BASE_URL,
    ...config.scope !== undefined ? { scope: config.scope } : {},
    includeSummary: config.includeSummary ?? true,
    conciseSnippet: config.conciseSnippet ?? false,
  }))
}
