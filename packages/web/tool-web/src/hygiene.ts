/**
 * Search result hygiene. Filters navigation portals, advertisements, dictionary
 * pages and off-topic sources, ranks what remains by semantic relevance to the
 * query, cleans text, and caps the result set. Applied in the tool layer so
 * every provider (primary and fallback) is treated identically.
 * @module @liusiqi-dev/sqh-tool-web/hygiene
 */

import type { WebSearchResult, WebSearchSource } from '@liusiqi-dev/sqh-web'

/** Default cap after filtering and ranking, used when the caller supplies none. */
export const DEFAULT_MAX_RESULTS = 16

/**
 * Domains whose pages are dictionary/translation lookups, navigation portals,
 * or known junk. Only add a domain here when it is objectively one of those
 * categories or when a live result proved it junk; never add by guesswork.
 * A domain entry also blocks every subdomain.
 */
export const BLOCKED_DOMAINS: readonly string[] = [
  // Dictionary and translation lookups.
  'dictionary.com',
  'thesaurus.com',
  'merriam-webster.com',
  'collinsdictionary.com',
  'oxfordlearnersdictionaries.com',
  'urbandictionary.com',
  'wordreference.com',
  'vocabulary.com',
  'dict.cn',
  'iciba.com',
  'youdao.com',
  'bab.la',
  // Navigation portals and URL farms.
  'hao123.com',
  '2345.com',
  '265.com',
]

/** Obvious sponsored/advertorial markers in a title or snippet. */
const AD_MARKER = /(^|\s)(广告|赞助|推广|sponsored|advertisement)(\s|：|:|$)/i

/** Navigation-portal markers. */
const NAV_MARKER = /(网址导航|上网导航|导航站|网址大全|hao123|2345导航)/i

/** A title that is itself a bare dictionary entry, not an article about one. */
const DICT_TITLE = /^(.{0,40}[\s-])?(dictionary|thesaurus|词典|字典|释义|近义词|同义词)$/i

/** Copyright and filing boilerplate that pollutes snippets. */
const BOILERPLATE = /(©|&copy;|all rights reserved|版权所有|[^。\n]{0,24}ICP备[^。\n]{0,24}|[^。\n]{0,24}公网安备[^。\n]{0,24})/gi

/** Minimum weighted query-token coverage for a source to be kept. */
const MIN_RELEVANCE = 0.2

/** True when a source URL's hostname is in the domain blacklist. */
export function isBlockedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch {
    // A malformed URL is not a known junk domain; let other checks decide.
    return false
  }
}

/**
 * Decode entities, strip HTML tags, drop boilerplate, and collapse whitespace.
 * Exported so the cleaning is directly testable.
 */
export function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0?39|x27);/gi, "'")
    .replace(BOILERPLATE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lexical tokens for relevance scoring: English/number words and CJK bigrams.
 * No external tokenizer dependency; bigrams are enough to detect topical
 * overlap in Chinese without imported dictionaries.
 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()
  for (const match of lower.matchAll(/[a-z0-9]+/g)) {
    const word = match[0] as string
    if (word.length >= 2) tokens.add(word)
  }
  for (const segment of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (segment.length === 1) tokens.add(segment)
    for (let index = 0; index < segment.length - 1; index++) {
      tokens.add(segment.slice(index, index + 2))
    }
  }
  return tokens
}

/**
 * Weighted fraction of query tokens present in a source. A title hit counts
 * 1.5, a snippet hit counts 1; the result is normalized to roughly 0..1.
 */
export function relevance(queryTokens: ReadonlySet<string>, title: string, snippet: string): number {
  if (queryTokens.size === 0) return 0.5
  const titleTokens = tokenize(title)
  const snippetTokens = tokenize(snippet)
  let weighted = 0
  for (const token of queryTokens) {
    if (titleTokens.has(token)) weighted += 1.5
    else if (snippetTokens.has(token)) weighted += 1
  }
  return weighted / (queryTokens.size * 1.5)
}

/** Options for {@link cleanSearchResult}. */
export interface HygieneOptions {
  /** Final source cap after filtering and ranking. Defaults to 16. */
  readonly maxResults?: number
}

/**
 * Filter, rank, clean, and cap one search result. The provider answer text,
 * when present, is cleaned but otherwise preserved; truncation is true if any
 * source was dropped here or upstream.
 */
export function cleanSearchResult(
  result: WebSearchResult,
  queries: readonly string[],
  options: HygieneOptions = {},
): WebSearchResult {
  const cap = options.maxResults ?? DEFAULT_MAX_RESULTS
  const queryTokens = new Set<string>()
  for (const query of queries) {
    for (const token of tokenize(query)) queryTokens.add(token)
  }

  const seen = new Set<string>()
  const scored: Array<{ source: WebSearchSource; score: number; order: number }> = []
  let order = 0
  for (const source of result.sources) {
    if (seen.has(source.url)) continue
    seen.add(source.url)
    if (isBlockedDomain(source.url)) continue

    const title = cleanText(source.title ?? '')
    const snippet = cleanText(source.snippet ?? '')
    const combined = `${title} ${snippet}`
    if (NAV_MARKER.test(combined) || AD_MARKER.test(combined)) continue
    if (DICT_TITLE.test(title.trim())) continue

    const score = relevance(queryTokens, title, snippet)
    if (score < MIN_RELEVANCE) continue

    scored.push({
      source: {
        ...source,
        ...title.length > 0 ? { title } : {},
        ...snippet.length > 0 ? { snippet } : {},
      },
      score,
      order: order++,
    })
  }

  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  const sources = scored.slice(0, cap).map(entry => entry.source)
  const dropped = scored.length > cap || result.truncated
  return {
    ...result.content !== undefined ? { content: cleanText(result.content) } : {},
    sources,
    truncated: dropped,
  }
}
