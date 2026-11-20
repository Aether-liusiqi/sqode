/**
 * Wire types for the Metaso search API (`POST https://metaso.cn/api/v1/search`).
 * Types only, no runtime code. Verified against the live endpoint: valid
 * parameters are q, size, scope, includeSummary, conciseSnippet; `page` and
 * `includeRawContent` are rejected or ignored. Each call reports `credits`.
 * @module @liusiqi-dev/sqh-web-search-metaso/types
 */

/** Request body sent to Metaso's search endpoint. */
export interface MetasoSearchRequest {
  /** The search query. */
  q: string
  /** Requested result count. The seam still enforces the final bound. */
  size?: number
  /** Retrieval scope, e.g. `webpage`. Omitted = provider default. */
  scope?: string
  /** Return the model-generated summary instead of a raw snippet. */
  includeSummary?: boolean
  /** Return a concise snippet. */
  conciseSnippet?: boolean
}

/** One entry of Metaso's `webpages[]`. */
export interface MetasoWebpage {
  title?: string
  link: string
  /** Provider relevance grade. */
  score?: 'high' | 'medium' | 'low'
  snippet?: string
  summary?: string
  position?: number
  authors?: string[]
  date?: string
}

/** Metaso's search response envelope. */
export interface MetasoSearchResponse {
  credits?: number
  searchParameters?: Record<string, unknown>
  webpages?: MetasoWebpage[]
  total?: number
  errCode?: number
  errMsg?: string
}
