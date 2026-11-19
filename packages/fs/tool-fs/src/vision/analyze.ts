/**
 * Branch B of read_image: produce a structured text result for a text-only
 * calling model. Phase 2 uses local OCR for every call; a vision provider is
 * added in Phase 3.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/analyze
 */

import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import { getConfigDir, loadConfig } from './config.ts'
import { runOcr } from './ocr.ts'

const OCR_SUMMARY = '[本地 OCR 降级结果] 仅含识别文字，无视觉语义分析'
const OCR_UNCERTAINTY = '未使用视觉模型，版面/语义/配色均未分析'
const OCR_WARNING = 'DEGRADED: no vision model, used local RapidOCR'

/** Wrap extracted OCR text into the `analysis` arm of read_image's output schema. */
export function wrapOcrText(fullText: string, lines: string[]) {
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
    meta: { warnings: [OCR_WARNING] },
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
 * Analyze an image for a text-only calling model. Phase 2 always uses OCR,
 * regardless of whether an API key is configured (that branch comes in Phase 3).
 * @param data - raw image bytes.
 * @param mediaType - declared or sniffed image type.
 * @returns a result matching the `analysis` arm of read_image's output schema.
 */
export async function analyzeImage(data: Uint8Array, mediaType: ImageMediaType) {
  const configDir = getConfigDir()
  const config = await loadConfig(configDir)
  try {
    const text = await runOcr(data, mediaType, config, configDir)
    return wrapOcrText(text.full_text, text.lines)
  } catch (error: unknown) {
    return wrapOcrError(error instanceof Error ? error.message : String(error))
  }
}
