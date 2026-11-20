/**
 * `MetasoSearchProvider`: a `WebSearchProvider` backed by the Metaso search API
 * (`POST /api/v1/search`). Contract measured against the live endpoint:
 * Bearer auth, valid params q/size/scope/includeSummary/conciseSnippet,
 * `page` is rejected, `includeRawContent` is ignored, and raw page content is
 * never returned. Mapping therefore uses each item's `summary` or `snippet`.
 * @module @liusiqi-dev/sqh-web-search-metaso/provider
 */

import type { CredentialRef } from '@liusiqi-dev/sqh-credentials'
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

/** Resolved provider options (the plugin's `apply` supplies credential and constant defaults). */
export interface MetasoSearchProviderOptions {
  /** Literal API key; when present it wins over {@link resolveApiKey}. */
  apiKey?: string
  /** Resolve the current API key for one search operation. */
  resolveApiKey?: () => Promise<string | undefined>
  /** Credential reference named by missing-credential diagnostics. */
  apiKeyEnv?: CredentialRef
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

  /**
   * Read options through a thunk rather than a value because the plugin's
   * settings section can change between searches, and re-registering the
   * provider to carry a new key or endpoint would make the seam's selection
   * observable to the user as a flicker.
   */
  constructor(private readonly resolveOptions: () => MetasoSearchProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== undefined)
      && URL.canParse(options.baseURL)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // One snapshot for the whole operation: credential resolution awaits, and a
    // settings write landing inside that await must not send a key resolved
    // from the old section to the endpoint named by the new one.
    const options = this.resolveOptions()
    const apiKey = await this.apiKey(options, signal)
    throwIfSearchAborted(signal)
    const size = request.maxResults ?? METASO_DEFAULT_SIZE
    let response: Response
    try {
      response = await fetch(`${options.baseURL}${METASO_SEARCH_PATH}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          q: request.query,
          size,
          ...options.scope !== undefined ? { scope: options.scope } : {},
          ...options.includeSummary ? { includeSummary: true } : {},
          ...options.conciseSnippet ? { conciseSnippet: true } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error) || signal?.aborted === true) throw searchAborted(signal, error)
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
        if (isAbortError(error) || signal?.aborted === true) throw searchAborted(signal, error)
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
      if (isAbortError(error) || signal?.aborted === true) throw searchAborted(signal, error)
      throw new WebError(`Metaso returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  /**
   * Resolve one operation's API key without retaining it on the provider.
   * @param options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
   * @param signal - abort signal for the surrounding search.
   * @returns the resolved key.
   */
  private async apiKey(options: MetasoSearchProviderOptions, signal?: AbortSignal): Promise<string> {
    throwIfSearchAborted(signal)
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
    const { resolveApiKey } = options
    const resolved = resolveApiKey === undefined ? undefined : await resolveCredential(resolveApiKey, signal)
    if (resolved !== undefined && resolved.length > 0) return resolved
    const ref = options.apiKeyEnv ?? 'METASO_API_KEY'
    throw new WebError(
      `Metaso search has no API key for "${ref}"; store it through the credentials service`
      + ' (the web Models page writes it), export it in the launching environment,'
      + ' or set a literal "apiKey" in the web-search-metaso config',
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
}

/**
 * Run one credential resolver under the search's cancellation signal. An
 * already-cancelled search never starts the resolver.
 * @param resolve - the resolver; a synchronous throw is mapped like a rejection.
 * @param signal - abort signal for the surrounding search.
 * @returns the resolved credential, or undefined when the resolver supplied none.
 * @throws {@link WebError} `WEB_ABORTED` on cancellation, `WEB_PROVIDER_ERROR` when the resolver fails.
 */
async function resolveCredential(
  resolve: () => Promise<string | undefined>, signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfSearchAborted(signal)
  try {
    return await abortable(resolve(), signal)
  } catch (error: unknown) {
    if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
    throw new WebError(
      `Metaso search credential resolution failed: ${String(error)}`,
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }
}

/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
      },
    )
  })
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('Metaso search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
