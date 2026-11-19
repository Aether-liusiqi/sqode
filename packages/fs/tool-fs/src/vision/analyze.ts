/**
 * Branch B of read_image: produce a structured text result for a text-only
 * calling model. Vision analysis is attempted when configured and degrades to
 * local OCR on failure; a text-only result is always produced.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/analyze
 */

import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import { getConfigDir, loadConfig } from './config.ts'
import { analyzeWithFailover } from './failover.ts'
import type { OcrText } from './ocr.ts'
import type { VisionParsed } from './prompt.ts'

const OCR_SUMMARY = '[本地算法分析] OCR 文字 + cv2 版面/配色 + YOLO 物体，无 VLM 语义关系'
const OCR_UNCERTAINTY = '未使用视觉模型，语义场景与关系未分析；物体/配色/版面来自本地算法'
const OCR_WARNING = 'DEGRADED: no vision model, used local algorithms (OCR + cv2 + YOLO)'

/** Wrap a successful vision analysis into the `analysis` arm of read_image's output schema. */
export function wrapVisionResult(provider: string, parsed: VisionParsed) {
  return { provider, result: parsed, meta: { warnings: [] as string[] } }
}

/** Wrap extracted image facts into the `analysis` arm of read_image's output schema. */
export function wrapOcrText(text: OcrText, warnings: string[] = [OCR_WARNING]) {
  const objects = text.objects ?? []
  return {
    provider: 'local-ocr',
    result: {
      summary: OCR_SUMMARY,
      ocr: { full_text: text.full_text, lines: text.lines },
      layout: { regions: text.regions ?? [] },
      semantics: { scene: null, entities: objects.map(o => o.label), relations: [] },
      visual: { dominant_colors: text.dominant_colors ?? [], style: null, notes: text.notes ?? [] },
      uncertainty: [OCR_UNCERTAINTY],
    },
    meta: { warnings: [...warnings, ...(text.warnings ?? [])] },
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
    return outcome.warnings.length > 0
      ? wrapOcrText(outcome.text, outcome.warnings)
      : wrapOcrText(outcome.text)
  }
  return wrapOcrError(outcome.message)
}
