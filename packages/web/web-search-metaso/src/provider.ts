/**
 * `MetasoSearchProvider`: a `WebSearchProvider` backed by the Metaso search API
 * (`POST /api/v1/search`). Contract measured against the live endpoint:
 * Bearer auth, valid params q/size/scope/includeSummary/conciseSnippet,
 * `page` is rejected, `includeRawContent` is ignored, and raw page content is
 * never returned. Mapping therefore uses each item's `summary` or `snippet`.
 * @module @liusiqi-dev/sqh-web-search-metaso/provider
 */

import { WebError } from '@liusiqi-dev/sqh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@liusiqi-dev/sqh-web'
import type { MetasoSearchResponse, MetasoWebpage } from './types.ts'

/** Stable id this provider registers under. */
export const METASO_PROVIDER_ID = 'metaso'

/** Default Metaso search endpoint; `/api/v1/search` is appended. */
export const METASO_DEFAULT_BASE_URL = 'https://metaso.cn'

/** Operation path appended to the base URL. */
export const METASO_SEARCH_PATH = '/api/v1/search'

/** Attribution header sent on every request. */
const USER_AGENT = 'siqi-harness/0.0.1'

/** Default result count when a request carries no `maxResults`. */
export const METASO_DEFAULT_SIZE = 8

/** Options after plugin defaults are applied. */
export interface MetasoSearchProviderOptions {
  /** Metaso API key. Empty/absent makes the provider unavailable. */
  apiKey: string
  /** Endpoint base; `/api/v1/search` is appended. */
  baseURL: string
  /** Retrieval scope sent as `scope`. Omitted = Metaso default. */
  scope?: string
  /** Ask Metaso for a model summary instead of a raw snippet. */
  includeSummary: boolean
  /** Ask Metaso for a concise snippet. */
  conciseSnippet: boolean
}

/** Grade weight used to order results by Metaso's own relevance signal. */
const SCORE_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 }

/**
 * Map one Metaso webpage entry to a normalized source, or `undefined` when it
 * has no URL (the seam requires a citeable URL and inventing one would lie).
 * Prefers `summary`, then `snippet`, as the portable snippet text.
 */
export function mapMetasoWebpage(page: MetasoWebpage): WebSearchSource | undefined {
  if (typeof page.link !== 'string' || page.link.length === 0) return undefined
  const summary = page.summary?.trim()
  const snippet = page.snippet?.trim()
  const text = summary !== undefined && summary.length > 0 ? summary : snippet
  return {
    url: page.link,
    ...page.title !== undefined && page.title.length > 0 ? { title: page.title } : {},
    ...text !== undefined && text.length > 0 ? { snippet: text } : {},
    ...page.date !== undefined && page.date.length > 0 ? { publishedAt: page.date } : {},
  }
}

/**
 * Map a Metaso response envelope to a normalized result. Entries are ordered
 * by Metaso's `score` (high before low) while keeping the provider's original
 * order within a grade, so a grade-sort never scrambles equal-grade results.
 */
export function mapMetasoResponse(response: MetasoSearchResponse): WebSearchResult {
  const pages = response.webpages ?? []
  const ordered = pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => (SCORE_WEIGHT[b.page.score ?? ''] ?? 0) - (SCORE_WEIGHT[a.page.score ?? ''] ?? 0) || a.index - b.index)
  const sources = ordered
    .map(({ page }) => mapMetasoWebpage(page))
    .filter((source): source is WebSearchSource => source !== undefined)
  // Metaso returns no generated answer field we can cite; `content` stays absent.
  // The seam enforces the final maxResults truncation, so truncated is false here.
  return { sources, truncated: false }
}

/** The Metaso-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class MetasoSearchProvider implements WebSearchProvider {
  readonly id = METASO_PROVIDER_ID

  constructor(private readonly options: MetasoSearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0 && URL.canParse(this.options.baseURL)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const size = request.maxResults ?? METASO_DEFAULT_SIZE
    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}${METASO_SEARCH_PATH}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          q: request.query,
          size,
          ...this.options.scope !== undefined ? { scope: this.options.scope } : {},
          ...this.options.includeSummary ? { includeSummary: true } : {},
          ...this.options.conciseSnippet ? { conciseSnippet: true } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Metaso search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Metaso search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Metaso API error (HTTP ${status})`
      try {
        const parsed = await response.json() as MetasoSearchResponse
        if (parsed.errMsg !== undefined && parsed.errMsg.length > 0) {
          message = `Metaso API error (${parsed.errCode ?? status}): ${parsed.errMsg}`
        }
      } catch (error: unknown) {
        if (isAbortError(error)) throw new WebError('Metaso search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as MetasoSearchResponse
      if (payload.errCode !== undefined && payload.errCode !== 0) {
        throw new WebError(`Metaso API error (${payload.errCode}): ${payload.errMsg ?? 'unknown'}`, 'WEB_PROVIDER_ERROR')
      }
      return mapMetasoResponse(payload)
    } catch (error: unknown) {
      if (error instanceof WebError) throw error
      if (isAbortError(error)) throw new WebError('Metaso search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Metaso returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
