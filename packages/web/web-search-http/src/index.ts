/**
 * Register a search-engine provider in `ctx.web`.
 *
 * Each search is one keyword query against a real index (Google Custom Search),
 * falling back to a second index (Bing) when the first answers too thinly. The
 * result carries the page's own title and snippet, so a citation can be checked
 * against the page rather than against a model's summary.
 * @module @liusiqi-dev/dsh-web-search-http
 */
import type { Volatile } from '@liusiqi-dev/cordis'

import type { Context } from '@liusiqi-dev/cordis'
import z from '@liusiqi-dev/schemastery'
import { launchEnvironmentOf } from '@liusiqi-dev/dsh-launch-environment'
import type {} from '@liusiqi-dev/dsh-web'

import { HttpSearchProvider } from './provider.ts'
import type { HttpSearchOptions, SearchEngine } from './types.ts'

export { HTTP_SEARCH_PROVIDER_ID, HttpSearchProvider } from './provider.ts'
export { BING_ENDPOINT, GOOGLE_ENDPOINT } from './engines.ts'
export type { HttpSearchOptions, HttpSearchRecord, SearchEngine, SearchHit } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-http'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Settings namespace carrying this provider's engine choice and keys. */
export const WEB_SEARCH_HTTP_SETTINGS_NAMESPACE = 'web-search-http'

/** Engine queried first when the setting is left unset. */
const DEFAULT_ENGINE: SearchEngine = 'google'

/** Engine tried when the primary result is too thin; empty disables fallback. */
const DEFAULT_FALLBACK: SearchEngine = 'bing'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MIN_RESULTS = 3
const DEFAULT_MIN_SNIPPET_RATIO = 0.5

/** Google Custom Search API key. */
const GOOGLE_API_KEY_ENV = 'GOOGLE_SEARCH_API_KEY'
/** Google Programmable Search engine id (`cx`). */
const GOOGLE_CX_ENV = 'GOOGLE_SEARCH_CX'
/** Bing Web Search subscription key. */
const BING_API_KEY_ENV = 'BING_SEARCH_API_KEY'

/** Plugin config (all optional — `apply` fills environment and constant defaults). */
export interface Config {
  /** Primary engine; `google` or `bing`. Defaults to `google`. */
  engine: Volatile<string>
  /** Fallback engine; empty string disables the fallback. Defaults to `bing`. */
  fallbackEngine: Volatile<string>
  /** Literal Google key; prefer the environment so no secret enters configuration files. */
  googleApiKey: Volatile<string | undefined>
  /** Literal Google search engine id. */
  googleCx: Volatile<string | undefined>
  /** Literal Bing subscription key. */
  bingApiKey: Volatile<string | undefined>
  /** Market hint such as `en-US` or `zh-CN`; advisory on both engines. */
  market: Volatile<string | undefined>
  /** Budget for one engine round trip, in milliseconds. */
  timeoutMs: Volatile<number>
  /** Hits below this count make the primary result count as thin. */
  minResults: Volatile<number>
  /** Share of hits that must carry a snippet for the primary result to stand. */
  minSnippetRatio: Volatile<number>
}

export const Config = z.object({
  engine: z.string().default(DEFAULT_ENGINE).volatile(),
  fallbackEngine: z.string().default(DEFAULT_FALLBACK).volatile(),
  googleApiKey: z.string().role('secret').volatile(),
  googleCx: z.string().volatile(),
  bingApiKey: z.string().role('secret').volatile(),
  market: z.string().volatile(),
  timeoutMs: z.number().step(1).min(1_000).default(DEFAULT_TIMEOUT_MS).volatile(),
  minResults: z.number().step(1).min(1).default(DEFAULT_MIN_RESULTS).volatile(),
  minSnippetRatio: z.number().min(0).max(1).default(DEFAULT_MIN_SNIPPET_RATIO).volatile(),
})

/** Narrow a configured engine name to the supported set. */
function asEngine(value: string | undefined): SearchEngine {
  return value === 'bing' ? 'bing' : 'google'
}

/** One value from the launch environment, treating blank as absent. */
function env(ctx: Context, key: string): string | undefined {
  const value = launchEnvironmentOf(ctx).get(key)?.value
  return value !== undefined && value.length > 0 ? value : undefined
}

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here, so the provider only reads
 * fully defaulted values.
 * @param ctx - plugin context supplying the environment plane.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(
  ctx: Context,
  config: { [K in keyof Config]: ReturnType<Config[K]['get']> },
): HttpSearchOptions {
  const fallbackRaw = config.fallbackEngine
  const fallback = fallbackRaw !== undefined && fallbackRaw.length === 0 ? undefined : asEngine(fallbackRaw)
  return {
    engine: asEngine(config.engine),
    ...fallback === undefined ? {} : { fallbackEngine: fallback },
    ...(config.googleApiKey ?? env(ctx, GOOGLE_API_KEY_ENV)) === undefined
      ? {}
      : { googleApiKey: (config.googleApiKey ?? env(ctx, GOOGLE_API_KEY_ENV)) as string },
    ...(config.googleCx ?? env(ctx, GOOGLE_CX_ENV)) === undefined
      ? {}
      : { googleCx: (config.googleCx ?? env(ctx, GOOGLE_CX_ENV)) as string },
    ...(config.bingApiKey ?? env(ctx, BING_API_KEY_ENV)) === undefined
      ? {}
      : { bingApiKey: (config.bingApiKey ?? env(ctx, BING_API_KEY_ENV)) as string },
    ...config.market === undefined ? {} : { market: config.market },
    timeoutMs: config.timeoutMs,
    minResults: config.minResults,
    minSnippetRatio: config.minSnippetRatio,
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append('web/http-search-request', request)
    },
  }
}

/** Register the search-engine provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new HttpSearchProvider(() => resolveOptions(ctx, {
    engine: config.engine.get(),
    fallbackEngine: config.fallbackEngine.get(),
    googleApiKey: config.googleApiKey.get(),
    googleCx: config.googleCx.get(),
    bingApiKey: config.bingApiKey.get(),
    market: config.market.get(),
    timeoutMs: config.timeoutMs.get(),
    minResults: config.minResults.get(),
    minSnippetRatio: config.minSnippetRatio.get(),
  })))
}
