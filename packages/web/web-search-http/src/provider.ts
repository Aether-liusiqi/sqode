/**
 * Search-engine provider: a real index query, not a model round trip.
 *
 * The primary engine answers; the fallback runs only when the primary result is
 * too thin to be useful. Both are keyword engines, so latency stays at index
 * speed and citations carry the page's own text.
 * @module @liusiqi-dev/dsh-web-search-http/provider
 */
import { WebError } from '@liusiqi-dev/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@liusiqi-dev/dsh-web'

import { runEngine } from './engines.ts'
import type { HttpSearchOptions, SearchHit } from './types.ts'

/** Stable id this provider registers under. */
export const HTTP_SEARCH_PROVIDER_ID = 'http-engines'

/** Hits requested when the caller sets no bound. */
const DEFAULT_WANT = 10

/**
 * Whether a primary result is too thin to stand on its own.
 *
 * A single engine can answer with almost nothing for a query it indexes badly
 * (identical pages, a narrow site, a regional gap). Treating "few hits or hits
 * without snippets" as a miss is what makes the fallback worth its latency.
 * @param hits - primary hits.
 * @param want - how many the caller asked for.
 * @param options - quality thresholds.
 * @returns true when the fallback should be tried.
 */
function poorQuality(hits: readonly SearchHit[], want: number, options: HttpSearchOptions): boolean {
  if (hits.length === 0) return true
  if (hits.length < Math.min(options.minResults, want)) return true
  const withSnippet = hits.filter(hit => (hit.snippet?.length ?? 0) > 0).length
  return withSnippet / hits.length < options.minSnippetRatio
}

/**
 * Project engine hits onto the seam's result shape, applying the caller's bound.
 * @param hits - hits in engine order.
 * @param want - caller bound.
 * @returns the seam result.
 */
function toResult(hits: readonly SearchHit[], want: number): WebSearchResult {
  return {
    sources: hits.slice(0, want).map(hit => ({
      url: hit.url,
      ...hit.title === undefined ? {} : { title: hit.title },
      ...hit.snippet === undefined ? {} : { snippet: hit.snippet },
      ...hit.publishedAt === undefined ? {} : { publishedAt: hit.publishedAt },
    })),
    truncated: hits.length > want,
  }
}

/** One search backend backed by a keyword engine. */
export class HttpSearchProvider implements WebSearchProvider {
  readonly id = HTTP_SEARCH_PROVIDER_ID

  /**
   * @param resolveOptions - reads the live settings section, so a saved change
   * applies to the next search without re-registering the provider.
   */
  constructor(private readonly resolveOptions: () => HttpSearchOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return options.engine === 'google'
      ? options.googleApiKey !== undefined && options.googleCx !== undefined
      : options.bingApiKey !== undefined
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const want = request.maxResults ?? DEFAULT_WANT
    const primary = await this.attempt(options.engine, request.query, want, options, signal)
    if (!poorQuality(primary.hits, want, options)) return toResult(primary.hits, want)

    const fallback = options.fallbackEngine
    if (fallback === undefined || fallback === options.engine) {
      if (primary.hits.length === 0) {
        throw new WebError(
          `the ${options.engine} search returned no sources for this query`,
          'WEB_PROVIDER_ERROR',
        )
      }
      return toResult(primary.hits, want)
    }

    let secondary: readonly SearchHit[]
    try {
      secondary = (await this.attempt(fallback, request.query, want, options, signal, options.engine)).hits
    } catch (error: unknown) {
      // The fallback is an improvement attempt, not a requirement: a primary
      // result that merely scored low is still better than failing the search.
      if (primary.hits.length === 0) throw error
      return toResult(primary.hits, want)
    }
    return toResult(secondary.length === 0 ? primary.hits : secondary, want)
  }

  /** Run one engine, recording what was asked and what came back. */
  private async attempt(
    engine: HttpSearchOptions['engine'],
    query: string,
    want: number,
    options: HttpSearchOptions,
    signal?: AbortSignal,
    fallbackFrom?: HttpSearchOptions['engine'],
  ): Promise<{ hits: readonly SearchHit[] }> {
    const started = Date.now()
    const { hits, endpoint } = await runEngine(engine, query, want, options, signal)
    options.recordRequest?.({
      engine,
      query,
      endpoint,
      resultCount: hits.length,
      elapsedMs: Date.now() - started,
      ...fallbackFrom === undefined ? {} : { fallbackFrom },
    })
    return { hits }
  }
}
