/** Integrated reader for text-only routes. @module @liusiqi-dev/sqh-tool-fs/src/vision */

export { analyzeImage, wrapOcrError, wrapOcrText, wrapVisionResult } from './analyze.ts'
export { DEFAULT_CONFIG, getConfigDir, loadConfig, VISION_HOME_ENV } from './config.ts'
export type { VisionConfig } from './config.ts'
export { analyzeWithFailover } from './failover.ts'
export type { AnalyzeOutcome } from './failover.ts'
export { runOcr } from './ocr.ts'
export type { OcrText } from './ocr.ts'
export { buildVisionMessages, parseVisionContent, VISION_SYSTEM_PROMPT } from './prompt.ts'
export type { VisionParsed } from './prompt.ts'
export { callVisionProvider } from './providers.ts'
