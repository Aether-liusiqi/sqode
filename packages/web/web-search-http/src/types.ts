/**
 * Vocabulary for the search-engine provider. Kept separate from the seam types
 * so the seam stays free of any one vendor's query parameters.
 * @module @liusiqi-dev/dsh-web-search-http/types
 */

/** Engines this provider can query. */
export type SearchEngine = 'google' | 'bing'

/**
 * One normalized hit from an engine response.
 *
 * `url` is the only field every engine returns, so it is required; the seam
 * already renders `title ?? hostname(url)` for display.
 */
export interface SearchHit {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Engine-supplied crawl/publication timestamp, ISO-8601. */
  readonly publishedAt?: string
}

/** One search attempt, as recorded for troubleshooting. */
export interface HttpSearchRecord {
  readonly engine: SearchEngine
  readonly query: string
  readonly endpoint: string
  readonly resultCount: number
  readonly elapsedMs: number
  /** Set when this attempt replaced a primary attempt that scored poorly. */
  readonly fallbackFrom?: SearchEngine
}

/** Fully resolved provider options, defaulted by the plugin's `apply`. */
export interface HttpSearchOptions {
  readonly engine: SearchEngine
  /** Engine tried when the primary result looks weak; omitted to never fall back. */
  readonly fallbackEngine?: SearchEngine
  /** Google Custom Search API key. */
  readonly googleApiKey?: string
  /** Google Programmable Search engine id (`cx`). */
  readonly googleCx?: string
  /** Bing Web Search subscription key. */
  readonly bingApiKey?: string
  /** Market/locale hint (`en-US`, `zh-CN`); advisory on both engines. */
  readonly market?: string
  readonly timeoutMs: number
  /** Hits below this count count as a weak primary result. */
  readonly minResults: number
  /** Share of hits that must carry a snippet for the primary result to stand. */
  readonly minSnippetRatio: number
  readonly recordRequest?: (record: HttpSearchRecord) => void
}
