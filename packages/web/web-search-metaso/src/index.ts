/**
 * Metaso-backed `WebSearchProvider` plugin. Contributes to the `ctx.web`
 * registry without owning the service.
 * @module @liusiqi-dev/sqh-web-search-metaso
 */

import type { Context, Volatile } from '@liusiqi-dev/cordis'
import { credentialRef } from '@liusiqi-dev/sqh-credentials'
import { launchEnvironmentOf } from '@liusiqi-dev/sqh-launch-environment'
import z from '@liusiqi-dev/schemastery'
import type {} from '@liusiqi-dev/sqh-web'
import { MetasoSearchProvider, METASO_DEFAULT_BASE_URL } from './provider.ts'
import type { MetasoSearchProviderOptions } from './provider.ts'

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

/** Credential reference resolved when the section names none. */
const DEFAULT_API_KEY_ENV = 'METASO_API_KEY'

/** Plugin config. Secrets are volatile so no literal is ever persisted. */
export interface Config {
  /** Literal Metaso API key; prefer {@link apiKeyEnv} so no secret enters a config file. */
  apiKey: Volatile<string | undefined>
  /** Credential reference resolved for each search; defaults to `METASO_API_KEY`. */
  apiKeyEnv: Volatile<string>
  /** Endpoint base; `/api/v1/search` is appended. Defaults to the public API. */
  baseURL: Volatile<string | undefined>
  /** Retrieval scope sent as `scope`. Omitted = Metaso default. */
  scope: Volatile<string | undefined>
  /** Ask Metaso for a model summary instead of a raw snippet. Defaults to true. */
  includeSummary: Volatile<boolean>
  /** Ask Metaso for a concise snippet. Defaults to false. */
  conciseSnippet: Volatile<boolean>
}

export const Config = z.object({
  apiKey: z.string().role('secret').volatile(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
  // Declared here rather than only at the use site: a configuration surface
  // renders the resolved section, so a field the schema omits reads as absent.
  baseURL: z.string().volatile(),
  scope: z.string().volatile(),
  includeSummary: z.boolean().default(true).volatile(),
  conciseSnippet: z.boolean().default(false).volatile(),
})

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Credential and environment lookups stay here rather than in the
 * provider: every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(
  ctx: Context, config: { [K in keyof Config]: ReturnType<Config[K]['get']> },
): MetasoSearchProviderOptions {
  const apiKeyEnv = credentialRef(config.apiKeyEnv)
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
    ? config.apiKey
    : undefined
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      // Without the seam the launching environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    apiKeyEnv,
    baseURL: config.baseURL ?? METASO_DEFAULT_BASE_URL,
    ...config.scope !== undefined ? { scope: config.scope } : {},
    includeSummary: config.includeSummary,
    conciseSnippet: config.conciseSnippet,
  }
}

/** Register the Metaso search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new MetasoSearchProvider(() => resolveOptions(ctx, {
    apiKey: config.apiKey.get(),
    apiKeyEnv: config.apiKeyEnv.get(),
    baseURL: config.baseURL.get(),
    scope: config.scope.get(),
    includeSummary: config.includeSummary.get(),
    conciseSnippet: config.conciseSnippet.get(),
  })))
}
