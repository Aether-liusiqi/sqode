/**
 * Read one Bing result page.
 *
 * The page is server-rendered, so no browser is involved: one HTTP GET returns
 * the same markup a person's browser would receive, and every organic result is
 * an `li.b_algo` block carrying its own title, link and extractive snippet. The
 * snippet is the page's text, which is what makes a citation checkable.
 * @module @liusiqi-dev/dsh-web-search-serp/parse
 */
import { load } from 'cheerio'

/** One parsed result row. */
export interface SerpHit {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

/** Markers a result page shows instead of results when it refuses automation. */
const BLOCK_MARKERS = [
  'unusual traffic',
  'are you a robot',
  'verify you are human',
  'captcha',
  'b_captcha',
] as const

/**
 * A leading publication stamp the engine inlines into the snippet.
 *
 * The stamp follows the request locale, so English ("Nov 1, 2026", "2 days
 * ago"), ISO, and Chinese ("2026年10月15日", "2 天之前") forms all appear in
 * practice. Leaving one form unstripped pushes a date into the snippet text,
 * which then reads as if the page said it.
 */
const DATE_PREFIX = new RegExp(
  '^(?:'
  + '[A-Z][a-z]{2} \\d{1,2}, \\d{4}'          // Nov 1, 2026
  + '|\\d{1,2}\\s+(?:hour|day|week|month|year)s?\\s+ago' // 2 days ago
  + '|\\d{4}-\\d{2}-\\d{2}'                   // 2026-11-01
  + '|\\d{4}年\\d{1,2}月\\d{1,2}日'              // 2026年11月1日
  + '|\\d{1,2}\\s*天之前'                        // 2 天之前
  + ')'
  + '\\s*(?:[·•|]\\s*)?',                      // separator the page appends after the stamp
  'u',
)

/**
 * Decode the engine's own click-tracking wrapper when a result links through it.
 *
 * Organic results usually point straight at the target, but some carry a
 * `bing.com/ck/a?...&u=a1<base64>` redirect. Returning that wrapper as a source
 * URL would make a citation useless, so the target is unwrapped here.
 * @param href - link as written in the markup.
 * @returns the target URL, or the input when it is not a wrapper.
 */
export function unwrapRedirect(href: string): string {
  try {
    const parsed = new URL(href, 'https://www.bing.com')
    if (!/(^|\.)bing\.com$/u.test(parsed.hostname)) return href
    const raw = parsed.searchParams.get('u')
    if (raw === null || !raw.startsWith('a1')) return href
    const encoded = raw.slice(2).replace(/-/gu, '+').replace(/_/gu, '/')
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    return /^https?:\/\//u.test(decoded) ? decoded : href
  } catch {
    return href
  }
}

/**
 * Whether the page is a refusal rather than a result list.
 * @param html - response body.
 * @returns true when the body carries a challenge marker.
 */
export function looksBlocked(html: string): boolean {
  const lowered = html.toLowerCase()
  return BLOCK_MARKERS.some(marker => lowered.includes(marker))
}

/**
 * Parse one result page into hits.
 * @param html - response body.
 * @returns hits in page order, with wrapper links unwrapped.
 */
export function parseSerp(html: string): SerpHit[] {
  const $ = load(html)
  const hits: SerpHit[] = []
  $('li.b_algo').each((_, element) => {
    const anchor = $(element).find('h2 a').first()
    const href = anchor.attr('href')
    if (href === undefined || href.length === 0) return
    const url = unwrapRedirect(href)
    if (!/^https?:\/\//u.test(url)) return
    const title = anchor.text().replace(/\s+/gu, ' ').trim()
    const raw = $(element).find('.b_caption p, p').first().text().replace(/\s+/gu, ' ').trim()
    const stamp = DATE_PREFIX.exec(raw)
    const snippet = stamp === null ? raw : raw.slice(stamp[0].length).trim()
    hits.push({
      url,
      ...title.length === 0 ? {} : { title },
      ...snippet.length === 0 ? {} : { snippet },
      // The matched stamp carries the separator the page appends after it; keep
      // the date alone, since this field is the page's claim about publication.
      ...stamp === null ? {} : { publishedAt: stamp[0].replace(/[\s·•|]+$/u, '') },
    })
  })
  return hits
}
