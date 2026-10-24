/**
 * One HTTP call per engine, normalized to {@link SearchHit}.
 *
 * Both engines answer a keyword query with a JSON document whose items carry a
 * title, a link and an extractive snippet. Nothing here summarizes: the snippet
 * is the page's own text, so a citation can be checked against the page.
 * @module @liusiqi-dev/dsh-web-search-http/engines
 */
import { WebError } from '@liusiqi-dev/dsh-web'

import type { SearchEngine, SearchHit } from './types.ts'

/** Google Programmable Search endpoint. */
export const GOOGLE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1'

/** Bing Web Search endpoint. */
export const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search'

/** Read a string field without asserting a shape onto untrusted JSON. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Narrow to a plain object so property reads stay typed. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Narrow to an array of plain objects. */
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  const out: Record<string, unknown>[] = []
  for (const entry of value) {
    const row = record(entry)
    if (row !== undefined) out.push(row)
  }
  return out
}

/**
 * Run one engine query.
 * @param engine - engine to call.
 * @param query - keyword query, passed through unchanged.
 * @param want - upper bound on hits to request.
 * @param options - resolved keys, market and timeout.
 * @param signal - caller cancellation.
 * @returns normalized hits in engine order.
 * @throws WebError when the engine refuses, mistimes, or answers a shape this build cannot read.
 */
export async function runEngine(
  engine: SearchEngine,
  query: string,
  want: number,
  options: { googleApiKey?: string; googleCx?: string; bingApiKey?: string; market?: string; timeoutMs: number },
  signal?: AbortSignal,
): Promise<{ hits: SearchHit[]; endpoint: string }> {
  return engine === 'google'
    ? await google(query, want, options, signal)
    : await bing(query, want, options, signal)
}

/** Google Custom Search JSON API. */
async function google(
  query: string,
  want: number,
  options: { googleApiKey?: string; googleCx?: string; market?: string; timeoutMs: number },
  signal?: AbortSignal,
): Promise<{ hits: SearchHit[]; endpoint: string }> {
  const key = options.googleApiKey
  const cx = options.googleCx
  if (key === undefined || cx === undefined) {
    throw new WebError('google search is not configured: an API key and search engine id are required', 'WEB_PROVIDER_UNAVAILABLE')
  }
  const url = new URL(GOOGLE_ENDPOINT)
  url.searchParams.set('key', key)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  // The API caps a single page at 10 results whatever `num` asks for.
  url.searchParams.set('num', String(Math.min(want, 10)))
  if (options.market !== undefined) url.searchParams.set('hl', options.market)

  const body = await readJson(url, signal === undefined ? {} : { signal }, options.timeoutMs, 'google')
  const hits = rows(record(body)?.['items']).flatMap((item) => {
    const link = text(item['link'])
    if (link === undefined) return []
    const hit: SearchHit = {
      url: link,
      ...text(item['title']) === undefined ? {} : { title: text(item['title']) as string },
      ...text(item['snippet']) === undefined ? {} : { snippet: text(item['snippet']) as string },
    }
    return [hit]
  })
  return { hits, endpoint: url.origin + url.pathname }
}

/** Bing Web Search v7. */
async function bing(
  query: string,
  want: number,
  options: { bingApiKey?: string; market?: string; timeoutMs: number },
  signal?: AbortSignal,
): Promise<{ hits: SearchHit[]; endpoint: string }> {
  const key = options.bingApiKey
  if (key === undefined) {
    throw new WebError('bing search is not configured: a subscription key is required', 'WEB_PROVIDER_UNAVAILABLE')
  }
  const url = new URL(BING_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(want, 50)))
  if (options.market !== undefined) url.searchParams.set('mkt', options.market)

  const body = await readJson(
    url,
    { ...signal === undefined ? {} : { signal }, headers: { 'Ocp-Apim-Subscription-Key': key } },
    options.timeoutMs,
    'bing',
  )
  const hits = rows(record(record(body)?.['webPages'])?.['value']).flatMap((item) => {
    const link = text(item['url'])
    if (link === undefined) return []
    const hit: SearchHit = {
      url: link,
      ...text(item['name']) === undefined ? {} : { title: text(item['name']) as string },
      ...text(item['snippet']) === undefined ? {} : { snippet: text(item['snippet']) as string },
      ...text(item['dateLastCrawled']) === undefined ? {} : { publishedAt: text(item['dateLastCrawled']) as string },
    }
    return [hit]
  })
  return { hits, endpoint: url.origin + url.pathname }
}

/**
 * Fetch and parse a JSON answer under one timeout.
 * @param url - request URL.
 * @param init - headers and caller cancellation.
 * @param timeoutMs - budget for the whole round trip.
 * @param engine - engine name, used in the failure text.
 * @returns the parsed document, or undefined when it was not JSON.
 * @throws WebError on a non-2xx answer, a timeout, or lost connectivity.
 */
async function readJson(
  url: URL,
  init: { signal?: AbortSignal; headers?: Record<string, string> },
  timeoutMs: number,
  engine: string,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('search timed out')) }, timeoutMs)
  const forward = (): void => { controller.abort(init.signal?.reason) }
  if (init.signal !== undefined) {
    if (init.signal.aborted) controller.abort(init.signal.reason)
    else init.signal.addEventListener('abort', forward, { once: true })
  }
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...init.headers },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new WebError(
        `${engine} answered ${String(response.status)} for ${url.origin + url.pathname}`
        + (response.status === 401 || response.status === 403 ? '; check the search API key' : ''),
        'WEB_PROVIDER_ERROR',
      )
    }
    const raw = await response.text()
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new WebError(`${engine} answered something that is not JSON`, 'WEB_PROVIDER_ERROR')
    }
  } catch (error: unknown) {
    if (error instanceof WebError) throw error
    if (controller.signal.aborted) {
      throw new WebError(init.signal?.aborted === true
        ? `${engine} search was cancelled`
        : `${engine} search exceeded its ${String(timeoutMs)}ms budget`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    throw new WebError(`could not reach ${engine} at ${url.origin}`, 'WEB_PROVIDER_ERROR', { cause: error })
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', forward)
  }
}
