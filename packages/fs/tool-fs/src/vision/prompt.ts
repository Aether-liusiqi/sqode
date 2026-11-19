/**
 * Prompt and response parser for the configured external vision provider. The
 * provider is asked to answer with strict JSON matching read_image's analysis
 * contract, so a text-only calling model can consume it directly.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/prompt
 */

/** Structural mirror of `@liusiqi-dev/sqh-util-values`'s JsonValue (no new dependency). */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Parsed vision fields matching the `analysis.result` arm of read_image. */
export interface VisionParsed {
  summary: string
  ocr: { full_text: string; lines: string[] }
  layout: { regions: JsonValue[] }
  semantics: { scene: string | null; entities: JsonValue[]; relations: JsonValue[] }
  visual: { dominant_colors: string[]; style: string | null; notes: string[] }
  uncertainty: string[]
}

/** Instruction sent as the system role. No markdown fences, one JSON object only. */
export const VISION_SYSTEM_PROMPT = [
  'You analyze an image for a text-only assistant.',
  'Reply with ONE JSON object and nothing else, without markdown fences, using exactly this shape:',
  '{',
  '  "summary": string,',
  '  "ocr": { "full_text": string, "lines": string[] },',
  '  "layout": { "regions": [{ "bbox": [number, number, number, number], "text": string }] },',
  '  "semantics": { "scene": string|null, "entities": string[], "relations": string[] },',
  '  "visual": { "dominant_colors": string[], "style": string|null, "notes": string[] },',
  '  "uncertainty": string[]',
  '}',
  'Transcribe all visible text into ocr. Describe layout, semantics and colors. List anything unclear in uncertainty.',
].join('\n')

/**
 * Build OpenAI-compatible chat messages. The caller supplies a complete
 * `data:` image URL so this module stays free of byte/base64 handling.
 * @param imageUrl - data URL of the image to analyze.
 * @returns the two-message request payload body's `messages` array.
 */
export function buildVisionMessages(imageUrl: string) {
  return [
    { role: 'system', content: VISION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this image and return the JSON object described in the system prompt.' },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
      ],
    },
  ]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (!value.every(item => typeof item === 'string')) return undefined
  return value
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : typeof value === 'string' ? value : null
}

function asJsonArray(value: unknown): JsonValue[] | undefined {
  // JSON.parse yields only JSON values, so any array from it is a JsonValue[].
  return Array.isArray(value) ? value as JsonValue[] : undefined
}

/**
 * Parse a provider reply into the analysis shape. Core fields (summary and
 * full_text) must be strings; every other field falls back to an empty value.
 * Returns null for unusable replies so the caller can degrade to local OCR.
 * @param content - assistant message text from the vision provider.
 * @returns parsed fields, or null when the reply cannot be used.
 */
export function parseVisionContent(content: string): VisionParsed | null {
  let raw: unknown
  try {
    raw = JSON.parse(content) as unknown
  } catch {
    return null
  }
  const root = asRecord(raw)
  if (root === undefined) return null
  const summary = asString(root.summary)
  const ocr = asRecord(root.ocr)
  if (summary === undefined || ocr === undefined) return null
  const fullText = asString(ocr.full_text)
  if (fullText === undefined) return null
  const layout = asRecord(root.layout)
  const semantics = asRecord(root.semantics)
  const visual = asRecord(root.visual)
  return {
    summary,
    ocr: { full_text: fullText, lines: asStringArray(ocr.lines) ?? [] },
    layout: { regions: asJsonArray(layout?.regions) ?? [] },
    semantics: {
      scene: asNullableString(semantics?.scene),
      entities: asJsonArray(semantics?.entities) ?? [],
      relations: asJsonArray(semantics?.relations) ?? [],
    },
    visual: {
      dominant_colors: asStringArray(visual?.dominant_colors) ?? [],
      style: asNullableString(visual?.style),
      notes: asStringArray(visual?.notes) ?? [],
    },
    uncertainty: asStringArray(root.uncertainty) ?? [],
  }
}
