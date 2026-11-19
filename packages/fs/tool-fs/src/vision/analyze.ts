/**
 * Branch B of read_image: produce a structured text result for a text-only
 * calling model. Vision analysis is attempted when configured and degrades to
 * local OCR on failure; a text-only result is always produced.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/analyze
 */

import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import { getConfigDir, loadConfig } from './config.ts'
import { analyzeWithFailover } from './failover.ts'
import type { VisionParsed } from './prompt.ts'

const OCR_SUMMARY = '[本地 OCR 降级结果] 仅含识别文字，无视觉语义分析'
const OCR_UNCERTAINTY = '未使用视觉模型，版面/语义/配色均未分析'
const OCR_WARNING = 'DEGRADED: no vision model, used local RapidOCR'

/** Wrap a successful vision analysis into the `analysis` arm of read_image's output schema. */
export function wrapVisionResult(provider: string, parsed: VisionParsed) {
  return { provider, result: parsed, meta: { warnings: [] as string[] } }
}

/** Wrap extracted OCR text into the `analysis` arm of read_image's output schema. */
export function wrapOcrText(fullText: string, lines: string[], warnings: string[] = [OCR_WARNING]) {
  return {
    provider: 'local-ocr',
    result: {
      summary: OCR_SUMMARY,
      ocr: { full_text: fullText, lines },
      layout: { regions: [] },
      semantics: { scene: null, entities: [], relations: [] },
      visual: { dominant_colors: [], style: null, notes: [] },
      uncertainty: [OCR_UNCERTAINTY],
    },
    meta: { warnings },
  }
}

/** Wrap an OCR failure as an explicit result, never a silent empty string or a thrown error. */
export function wrapOcrError(message: string) {
  return {
    provider: 'unavailable',
    result: {
      summary: '[本地 OCR 失败] 未能从图片提取文字',
      ocr: { full_text: '', lines: [] },
      layout: { regions: [] },
      semantics: { scene: null, entities: [], relations: [] },
      visual: { dominant_colors: [], style: null, notes: [] },
      uncertainty: [OCR_UNCERTAINTY, `本地 OCR 失败：${message}`],
    },
    meta: { warnings: [`ERROR: local OCR failed: ${message}`] },
  }
}

/**
 * Analyze an image for a text-only calling model. Vision is used when a key is
 * configured and `ocrFallback` is not 'fallback'; otherwise local OCR is used.
 * Any vision failure degrades to OCR with an explicit warning.
 * @param data - raw image bytes.
 * @param mediaType - declared or sniffed image type.
 * @returns a result matching the `analysis` arm of read_image's output schema.
 */
export async function analyzeImage(data: Uint8Array, mediaType: ImageMediaType) {
  const configDir = getConfigDir()
  const config = await loadConfig(configDir)
  const outcome = await analyzeWithFailover(data, mediaType, config, configDir)
  if (outcome.kind === 'vision') return wrapVisionResult(config.provider, outcome.parsed)
  if (outcome.kind === 'ocr') {
    const { full_text, lines } = outcome.text
    return outcome.warnings.length > 0
      ? wrapOcrText(full_text, lines, outcome.warnings)
      : wrapOcrText(full_text, lines)
  }
  return wrapOcrError(outcome.message)
}
