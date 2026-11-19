/**
 * Local OCR fallback for the integrated reader. Image bytes are written to a
 * fixed-prefix temp file, passed to the RapidOCR Python script stored in the
 * config directory, and the temp file is always removed. Failures are surfaced.
 * @module @liusiqi-dev/sqh-tool-fs/src/vision/ocr
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImageMediaType } from '@liusiqi-dev/sqh-attachment'
import type { VisionConfig } from './config.ts'
import { getConfigDir } from './config.ts'

/**
 * Python source embedded as text so the packaged bundle needs no extra asset file.
 * Writes `{"full_text": ..., "lines": [...]}` with non-ASCII preserved.
 */
const OCR_SCRIPT = `import json
import sys

from rapidocr_onnxruntime import RapidOCR

image_path = sys.argv[1]
result, _elapse = RapidOCR()(image_path)

lines = []
if result:
    for item in result:
        text = item[1]
        if text:
            lines.append(text)

full_text = "\\n".join(lines)
print(json.dumps({"full_text": full_text, "lines": lines}, ensure_ascii=False))
`

/** Wall-clock cap for one OCR invocation; the child is killed on expiry. */
const OCR_TIMEOUT_MS = 60_000

const EXT_BY_MEDIA_TYPE: Readonly<Partial<Record<ImageMediaType, string>>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/** Text extracted by RapidOCR. */
export interface OcrText {
  full_text: string
  lines: string[]
}

/** Spawn the configured Python interpreter and collect its stdout. */
async function spawnPython(pythonPath: string, args: readonly string[]): Promise<string> {
  const child = spawn(pythonPath, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => child.kill(), OCR_TIMEOUT_MS)
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { stdout += chunk })
      child.stderr.on('data', (chunk: string) => { stderr += chunk })
      child.on('error', (error: Error) => reject(new Error(`failed to start OCR Python "${pythonPath}": ${error.message}`)))
      child.on('close', resolve)
    })
    if (code === null) throw new Error(`local OCR timed out after ${OCR_TIMEOUT_MS}ms`)
    if (code !== 0) throw new Error(`OCR Python exited with code ${code}: ${stderr.trim().slice(0, 300)}`)
    return stdout
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run RapidOCR over the given image bytes.
 * @param data - raw image bytes read through the current filesystem backend.
 * @param mediaType - declared or sniffed image type, used only for the temp extension.
 * @param config - resolved reader config supplying the Python interpreter.
 * @param configDir - directory that holds (and receives) `ocr.py`.
 * @returns the extracted full text and per-line texts.
 * @throws when Python cannot start, times out, exits non-zero, or emits invalid JSON.
 */
export async function runOcr(
  data: Uint8Array,
  mediaType: ImageMediaType,
  config: VisionConfig,
  configDir: string = getConfigDir(),
): Promise<OcrText> {
  await mkdir(configDir, { recursive: true })
  const scriptPath = join(configDir, 'ocr.py')
  await writeFile(scriptPath, OCR_SCRIPT, 'utf8')

  const ext = EXT_BY_MEDIA_TYPE[mediaType] ?? '.img'
  const tmpPath = join(tmpdir(), `read_image-ocr-${randomUUID()}${ext}`)
  await writeFile(tmpPath, data)
  try {
    const stdout = await spawnPython(config.pythonPath, [scriptPath, tmpPath])
    let parsed: unknown
    try {
      parsed = JSON.parse(stdout) as unknown
    } catch {
      throw new Error(`OCR script returned non-JSON output: ${stdout.trim().slice(0, 200)}`)
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OCR script returned an unexpected JSON shape')
    }
    const record = parsed as Record<string, unknown>
    const lines = Array.isArray(record.lines)
      ? record.lines.filter((line): line is string => typeof line === 'string')
      : []
    const fullText = typeof record.full_text === 'string' ? record.full_text : lines.join('\n')
    return { full_text: fullText, lines }
  } finally {
    await rm(tmpPath, { force: true })
  }
}
