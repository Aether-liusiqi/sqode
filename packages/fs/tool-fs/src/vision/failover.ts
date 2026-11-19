/**
 * Orchestration for read_image's text-only route: call the configured vision
 * provider when a key is present, otherwise (or on failure) use local OCR.
 *
 * Assumed semantics for `ocrFallback`, which was reserved but unused in Phase 2:
 *   - 'prefer'   (default): with a key, try vision first and degrade to OCR.
 *   - 'fallback': force local OCR even when a key is configured.
 * Without a key, local OCR is always used, matching Phase 2 behaviour.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/failover
 */

import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import type { VisionConfig } from './config.ts'
import type { OcrText } from './ocr.ts'
import { runOcr } from './ocr.ts'
import { callVisionProvider } from './providers.ts'
import type { VisionParsed } from './prompt.ts'
import { parseVisionContent } from './prompt.ts'

/** Result of one analysis attempt, before it is wrapped into the output schema. */
export type AnalyzeOutcome =
  | { kind: 'vision'; parsed: VisionParsed }
  | { kind: 'ocr'; text: OcrText; warnings: string[] }
  | { kind: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Analyze an image, degrading to local OCR when vision is unavailable.
 * @param data - raw image bytes.
 * @param mediaType - declared or sniffed image type.
 * @param config - resolved reader config.
 * @param configDir - directory holding `ocr.py`.
 * @returns an outcome the caller wraps into read_image's output schema.
 */
export async function analyzeWithFailover(
  data: Uint8Array,
  mediaType: ImageMediaType,
  config: VisionConfig,
  configDir: string,
): Promise<AnalyzeOutcome> {
  const useVision = config.apiKey.trim() !== '' && config.ocrFallback !== 'fallback'

  if (!useVision) {
    try {
      return { kind: 'ocr', text: await runOcr(data, mediaType, config, configDir), warnings: [] }
    } catch (error: unknown) {
      return { kind: 'error', message: errorMessage(error) }
    }
  }

  try {
    const content = await callVisionProvider(config, data, mediaType)
    const parsed = parseVisionContent(content)
    if (parsed === null) throw new Error('vision response did not contain the expected JSON')
    return { kind: 'vision', parsed }
  } catch (visionError: unknown) {
    const visionMessage = errorMessage(visionError)
    try {
      return {
        kind: 'ocr',
        text: await runOcr(data, mediaType, config, configDir),
        warnings: [`DEGRADED: vision provider failed (${visionMessage}), used local RapidOCR`],
      }
    } catch (ocrError: unknown) {
      return { kind: 'error', message: `${visionMessage}; OCR also failed: ${errorMessage(ocrError)}` }
    }
  }
}
