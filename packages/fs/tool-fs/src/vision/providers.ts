/**
 * OpenAI-compatible chat-completions call for the configured vision provider.
 * Uses the runtime's global `fetch`, so no HTTP dependency is added to the
 * package. A non-OK status or an unusable body is surfaced as an error for the
 * failover layer to degrade from.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/providers
 */

import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import type { VisionConfig } from './config.ts'
import { buildVisionMessages } from './prompt.ts'

/** Wall-clock cap for one vision request. */
const REQUEST_TIMEOUT_MS = 60_000

/** Build the `data:` URL sent in the image_url content part. */
function toDataUrl(data: Uint8Array, mediaType: ImageMediaType): string {
  return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`
}

/**
 * Send one image to the configured provider and return the assistant text.
 * @param config - resolved reader config supplying key, base URL and model.
 * @param data - raw image bytes.
 * @param mediaType - declared or sniffed image type.
 * @returns the first choice's `message.content` text.
 * @throws on transport failure, non-OK HTTP status, or malformed response body.
 */
export async function callVisionProvider(
  config: VisionConfig,
  data: Uint8Array,
  mediaType: ImageMediaType,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildVisionMessages(toDataUrl(data, mediaType)),
      temperature: 0,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`vision provider returned HTTP ${response.status}`)

  let payload: unknown
  try {
    payload = await response.json() as unknown
  } catch {
    throw new Error('vision provider returned non-JSON body')
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('vision provider returned an unexpected JSON shape')
  }
  const choices = (payload as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('vision provider response has no choices')
  }
  const first: unknown = choices[0]
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    throw new Error('vision provider returned an invalid choice')
  }
  const message = (first as Record<string, unknown>).message
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('vision provider choice has no message')
  }
  const content = (message as Record<string, unknown>).content
  if (typeof content !== 'string') throw new Error('vision provider message content is not text')
  return content
}
