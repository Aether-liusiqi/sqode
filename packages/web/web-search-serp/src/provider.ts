/**
 * Keyless search provider: one GET against a public result page.
 *
 * No credential and no browser are involved. The two things this has to get
 * right are politeness and honesty: requests are spaced so a busy agent cannot
 * turn a handful of searches into a burst, and a page that is a challenge or a
 * changed layout raises an error naming that cause instead of returning an
 * empty list that reads as "no results exist".
 * @module @liusiqi-dev/dsh-web-search-serp/provider
 */
import { WebError } from '@liusiqi-dev/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@liusiqi-dev/dsh-web'

import { looksBlocked, parseSerp } from './parse.ts'
import type { SerpHit } from './parse.ts'
import type { SerpSearchOptions } from './types.ts'

/** Stable id this provider registers under. */
export const SERP_PROVIDER_ID = 'serp-bing'

/** Result page this provider reads. */
export const SERP_ENDPOINT = 'https://www.bing.com/search'

/** Hits requested when the caller sets no bound. */
const DEFAULT_WANT = 10

/**
 * Keep at most `limit` sources per host, preserving page order.
 *
 * A result page often lists several pages of one site; without a cap the source
 * list becomes one site's table of contents and the agent loses the spread a
 * search is for.
 * @param hits - parsed hits in page order.
 * @param limit - per-host cap.
 * @returns the capped list.
 */
function capPerHost(hits: readonly SerpHit[], limit: number): SerpHit[] {
  const seen = new Map<string, number>()
  const kept: SerpHit[] = []
  for (const hit of hits) {
    let host = hit.url
    try {
      host = new URL(hit.url).hostname
    } catch {
      // A non-absolute URL was already filtered during parsing.
    }
    const count = seen.get(host) ?? 0
    if (count >= limit) continue
    seen.set(host, count + 1)
    kept.push(hit)
  }
  return kept
}

/** One search backend that reads a public result page. */
export class SerpSearchProvider implements WebSearchProvider {
  readonly id = SERP_PROVIDER_ID
  /** Earliest moment the next request may start, in epoch milliseconds. */
  private nextAt = 0

  /**
   * @param resolveOptions - reads the live settings section, so a saved change
   * applies to the next search without re-registering the provider.
   */
  constructor(private readonly resolveOptions: () => SerpSearchOptions) {}

  available(): boolean {
    // Nothing is required beyond connectivity, so this route never withholds
    // itself: an unreachable network is reported by the search that tries it.
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const want = request.maxResults ?? DEFAULT_WANT
    await this.gate(options.minIntervalMs, signal)

    const url = new URL(SERP_ENDPOINT)
    url.searchParams.set('q', request.query)
    if (options.market !== undefined) url.searchParams.set('mkt', options.market)
    if (options.language !== undefined) url.searchParams.set('setlang', options.language)

    const started = Date.now()
    const html = await this.get(url, options, signal)
    const blocked = looksBlocked(html)
    const hits = blocked ? [] : parseSerp(html)
    options.recordRequest?.({
      query: request.query,
      endpoint: url.origin + url.pathname,
      resultCount: hits.length,
      elapsedMs: Date.now() - started,
      blocked,
    })

    if (blocked) {
      throw new WebError(
        'the search page answered with a bot challenge instead of results.'
        + ' Configure an API-backed search provider, or route this traffic through a trusted network.',
        'WEB_PROVIDER_ERROR',
      )
    }
    if (hits.length === 0) {
      throw new WebError(
        `the search page contained no recognizable results for this query (${String(html.length)} bytes received).`
        + ' If this repeats, the page markup changed and this provider needs updating.',
        'WEB_PROVIDER_ERROR',
      )
    }

    const capped = capPerHost(hits, options.perHostLimit)
    return {
      sources: capped.slice(0, want).map(hit => ({
        url: hit.url,
        ...hit.title === undefined ? {} : { title: hit.title },
        ...hit.snippet === undefined ? {} : { snippet: hit.snippet },
        ...hit.publishedAt === undefined ? {} : { publishedAt: hit.publishedAt },
      })),
      truncated: capped.length > want,
    }
  }

  /**
   * Wait out the politeness gap for this provider.
   * @param intervalMs - minimum gap between two requests.
   * @param signal - caller cancellation.
   */
  private async gate(intervalMs: number, signal?: AbortSignal): Promise<void> {
    const now = Date.now()
    const startAt = Math.max(now, this.nextAt)
    this.nextAt = startAt + intervalMs
    if (startAt <= now) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, startAt - now)
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(new WebError('search was cancelled while waiting its turn', 'WEB_PROVIDER_ERROR'))
      }
      if (signal?.aborted === true) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Fetch one result page under the configured timeout.
   * @param url - request URL.
   * @param options - user agent and timeout.
   * @param signal - caller cancellation.
   * @returns the response body.
   */
  private async get(url: URL, options: SerpSearchOptions, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(new Error('search timed out')) }, options.timeoutMs)
    const forward = (): void => { controller.abort(signal?.reason) }
    if (signal !== undefined) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', forward, { once: true })
    }
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': options.userAgent,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': options.language ?? 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new WebError(
          `the search page answered ${String(response.status)} for ${url.origin}`, 'WEB_PROVIDER_ERROR')
      }
      return await response.text()
    } catch (error: unknown) {
      if (error instanceof WebError) throw error
      if (controller.signal.aborted) {
        throw new WebError(signal?.aborted === true
          ? 'search was cancelled'
          : `search exceeded its ${String(options.timeoutMs)}ms budget`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      throw new WebError(`could not reach ${url.origin}`, 'WEB_PROVIDER_ERROR', { cause: error })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    }
  }
}
