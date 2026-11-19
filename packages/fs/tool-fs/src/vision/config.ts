/**
 * Configuration for the integrated reader. Reads `~/.sqh-vision-reader/config.json`.
 * The API key comes from the user-level TOKENHUB_API_KEY environment variable,
 * never from a literal in source. A missing file, a malformed file, or missing
 * fields all fall back to defaults; an empty `apiKey` uses local OCR.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/config
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Home override for tests; production always uses the OS home directory. */
export const VISION_HOME_ENV = 'SQH_VISION_READER_HOME'

/** User-level environment variable supplying the TokenHub API key. */
export const TOKENHUB_KEY_ENV = 'TOKENHUB_API_KEY'

/** Directory holding `config.json` and the generated `ocr.py`. */
export function getConfigDir(): string {
  return join(process.env[VISION_HOME_ENV] ?? homedir(), '.sqh-vision-reader')
}

/** Resolved reader configuration. */
export interface VisionConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  ocrFallback: 'prefer' | 'fallback'
  pythonPath: string
  cacheTtl: number
}

/** Defaults used whenever the config file is absent or incomplete. */
export const DEFAULT_CONFIG: VisionConfig = {
  provider: 'tencent-tokenhub-vision',
  apiKey: '',
  baseUrl: 'https://tokenhub.tencentmaas.com/v1',
  model: 'hy-vision-2.0-instruct',
  ocrFallback: 'prefer',
  pythonPath: 'D:\\PythonEnv\\myenv\\Scripts\\python.exe',
  cacheTtl: 0,
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Load config, merging present fields over defaults. Never throws for a missing
 * or malformed file so a text-only route can always fall back to OCR.
 * @param configDir - directory to read `config.json` from; defaults to `getConfigDir()`.
 * @returns the resolved configuration.
 */
export async function loadConfig(configDir: string = getConfigDir()): Promise<VisionConfig> {
  let record: Record<string, unknown> = {}
  try {
    const raw: unknown = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8')) as unknown
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      record = raw as Record<string, unknown>
    }
  } catch {
    // A missing or malformed file leaves `record` empty, so defaults apply.
  }
  const ocrFallback = asString(record.ocrFallback)
  return {
    provider: asString(record.provider) ?? DEFAULT_CONFIG.provider,
    apiKey: process.env[TOKENHUB_KEY_ENV]?.trim() || (asString(record.apiKey) ?? DEFAULT_CONFIG.apiKey),
    baseUrl: asString(record.baseUrl) ?? DEFAULT_CONFIG.baseUrl,
    model: asString(record.model) ?? DEFAULT_CONFIG.model,
    ocrFallback: ocrFallback === 'prefer' || ocrFallback === 'fallback' ? ocrFallback : DEFAULT_CONFIG.ocrFallback,
    pythonPath: asString(record.pythonPath) ?? DEFAULT_CONFIG.pythonPath,
    cacheTtl: asFiniteNumber(record.cacheTtl) ?? DEFAULT_CONFIG.cacheTtl,
  }
}
