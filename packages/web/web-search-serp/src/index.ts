/**
 * Register a keyless search provider in `ctx.web`.
 *
 * It reads one public result page, so a search needs no credential, no account
 * and no browser: connectivity is the whole prerequisite. Requests are spaced
 * per provider instance and capped per host, and a challenge page is reported
 * as such rather than as an empty result set.
 * @module @liusiqi-dev/dsh-web-search-serp
 */
import type { Volatile } from '@liusiqi-dev/cordis'

import type { Context } from '@liusiqi-dev/cordis'
import z from '@liusiqi-dev/schemastery'
import type {} from '@liusiqi-dev/dsh-launch-environment'
import type {} from '@liusiqi-dev/dsh-web'

import { SerpSearchProvider } from './provider.ts'
import type { SerpSearchOptions } from './types.ts'

export { SERP_ENDPOINT, SERP_PROVIDER_ID, SerpSearchProvider } from './provider.ts'
export { looksBlocked, parseSerp, unwrapRedirect } from './parse.ts'
export type { SerpHit } from './parse.ts'
export type { SerpSearchOptions, SerpSearchRecord } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-serp'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Settings namespace carrying this provider's pacing and locale settings. */
export const WEB_SEARCH_SERP_SETTINGS_NAMESPACE = 'web-search-serp'

/**
 * Gap between two page requests.
 *
 * A search page is a shared resource reached without a contract, so the default
 * keeps a burst of tool calls from becoming a burst of requests to it.
 */
const DEFAULT_MIN_INTERVAL_MS = 2_000

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_PER_HOST_LIMIT = 2

/** An ordinary desktop browser string; the page serves static markup either way. */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Plugin config (all optional — `apply` fills the constant defaults). */
export interface Config {
  /** Minimum gap between two page requests, in milliseconds. */
  minIntervalMs: Volatile<number>
  /** Budget for one page round trip, in milliseconds. */
  timeoutMs: Volatile<number>
  /** Sources kept per registrable host. */
  perHostLimit: Volatile<number>
  /** Market hint passed to the engine as `mkt`. */
  market: Volatile<string | undefined>
  /** Language passed as `setlang`, e.g. `zh-Hans`. */
  language: Volatile<string | undefined>
  /** User-Agent sent with the request. */
  userAgent: Volatile<string>
}

export const Config = z.object({
  minIntervalMs: z.number().step(1).min(0).default(DEFAULT_MIN_INTERVAL_MS).volatile(),
  timeoutMs: z.number().step(1).min(1_000).default(DEFAULT_TIMEOUT_MS).volatile(),
  perHostLimit: z.number().step(1).min(1).default(DEFAULT_PER_HOST_LIMIT).volatile(),
  market: z.string().volatile(),
  language: z.string().volatile(),
  userAgent: z.string().default(DEFAULT_USER_AGENT).volatile(),
})

/**
 * Project one resolved section into the options the provider serves its next
 * search with.
 * @param ctx - plugin context, used for the session request record.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(
  ctx: Context,
  config: { [K in keyof Config]: ReturnType<Config[K]['get']> },
): SerpSearchOptions {
  return {
    minIntervalMs: config.minIntervalMs,
    timeoutMs: config.timeoutMs,
    perHostLimit: config.perHostLimit,
    ...config.market === undefined ? {} : { market: config.market },
    ...config.language === undefined ? {} : { language: config.language },
    userAgent: config.userAgent,
    recordRequest: (record) => {
      ctx.get('agents')?.currentInitiator()?.session.append('web/serp-search-request', record)
    },
  }
}

/** Register the result-page provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new SerpSearchProvider(() => resolveOptions(ctx, {
    minIntervalMs: config.minIntervalMs.get(),
    timeoutMs: config.timeoutMs.get(),
    perHostLimit: config.perHostLimit.get(),
    market: config.market.get(),
    language: config.language.get(),
    userAgent: config.userAgent.get(),
  })))
}
