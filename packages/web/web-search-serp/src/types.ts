/**
 * Options and records for the result-page provider.
 * @module @liusiqi-dev/dsh-web-search-serp/types
 */

/** One search attempt, as recorded for troubleshooting. */
export interface SerpSearchRecord {
  readonly query: string
  readonly endpoint: string
  readonly resultCount: number
  readonly elapsedMs: number
  /** True when a challenge page was served instead of results. */
  readonly blocked: boolean
}

/** Fully resolved provider options, defaulted by the plugin's `apply`. */
export interface SerpSearchOptions {
  /** Minimum gap between two page requests, in milliseconds. */
  readonly minIntervalMs: number
  /** Budget for one page round trip, in milliseconds. */
  readonly timeoutMs: number
  /** Sources kept per registrable host, so one site cannot fill the list. */
  readonly perHostLimit: number
  /** Market/locale hint, passed to the engine as `mkt`. */
  readonly market?: string
  /** User-Agent sent with the request; an ordinary browser string by default. */
  readonly userAgent: string
  /** Language sent as `setlang`, e.g. `zh-Hans` or `en`. */
  readonly language?: string
  readonly recordRequest?: (record: SerpSearchRecord) => void
}
