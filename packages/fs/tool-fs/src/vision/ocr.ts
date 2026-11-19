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
 * One invocation emits OCR text plus pure-algorithm image facts: dominant colors
 * (cv2 K-means), geometric layout (Canny/dilate/contours), and detected objects
 * (YOLO). Each subsystem is isolated so a partial failure keeps the other fields.
 * Non-ASCII is preserved in the JSON output.
 */
const OCR_SCRIPT = `import json
import sys
import os

image_path = sys.argv[1]
config_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))

warnings = []
full_text = ""
lines = []
regions = []
dominant_colors = []
objects = []
notes = []

try:
    from rapidocr_onnxruntime import RapidOCR
    result, _elapse = RapidOCR()(image_path)
    for item in (result or []):
        text = item[1]
        if not text:
            continue
        lines.append(text)
        try:
            pts = item[0]
            xs = [float(p[0]) for p in pts]
            ys = [float(p[1]) for p in pts]
            regions.append({"bbox": [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))], "kind": "text", "text": text})
        except Exception:
            pass
    full_text = "\\n".join(lines)
except Exception as e:
    warnings.append("OCR failed: " + str(e)[:200])

img = None
w = 0
h = 0
try:
    import numpy as np
    import cv2
    img = cv2.imread(image_path)
    if img is None:
        warnings.append("cv2 could not read image")
    else:
        h, w = img.shape[:2]
        notes.append("dimensions: " + str(w) + "x" + str(h))
except Exception as e:
    warnings.append("cv2 load failed: " + str(e)[:200])

if img is not None:
    try:
        small = cv2.resize(img, (max(1, min(w, 200)), max(1, min(h, 200))))
        data = small.reshape((-1, 3)).astype(np.float32)
        k = min(6, data.shape[0])
        if k >= 1:
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
            _compact, labels, centers = cv2.kmeans(data, k, None, criteria, 4, cv2.KMEANS_PP_CENTERS)
            counts = np.bincount(labels.flatten(), minlength=k)
            for idx in np.argsort(-counts):
                if counts[idx] <= 0:
                    continue
                b, g, r = centers[idx]
                dominant_colors.append("#%02x%02x%02x" % (int(r), int(g), int(b)))
    except Exception as e:
        warnings.append("color analysis failed: " + str(e)[:200])

if img is not None:
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 100, 200)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        dilated = cv2.dilate(edges, kernel, iterations=2)
        cnts, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        area_threshold = w * h * 0.005
        shape_count = 0
        for c in cnts:
            x, y, cw, ch = cv2.boundingRect(c)
            if cw * ch < area_threshold:
                continue
            regions.append({"bbox": [x, y, x + cw, y + ch], "kind": "shape"})
            shape_count += 1
            if shape_count >= 20:
                break
        density = float(np.count_nonzero(edges)) / float(edges.size)
        notes.append("edge density: " + str(round(density, 3)))
        notes.append("regions: " + str(len(regions)))
    except Exception as e:
        warnings.append("geometry analysis failed: " + str(e)[:200])

try:
    weights = os.path.join(config_dir, "yolov8n.pt")
    if os.path.exists(weights):
        from ultralytics import YOLO
        model = YOLO(weights)
        res = model(image_path, verbose=False)[0]
        for b in (res.boxes or []):
            try:
                label = model.names[int(b.cls[0])]
                bbox = [int(v) for v in b.xyxy[0].tolist()]
                conf = round(float(b.conf[0]), 2)
                objects.append({"label": label, "bbox": bbox, "confidence": conf})
            except Exception:
                pass
        notes.append("objects: " + str(len(objects)))
    else:
        warnings.append("YOLO weights not found: " + weights)
except Exception as e:
    warnings.append("YOLO failed: " + str(e)[:200])

print(json.dumps({"full_text": full_text, "lines": lines, "regions": regions, "dominant_colors": dominant_colors, "objects": objects, "notes": notes, "warnings": warnings}, ensure_ascii=False))
`

/** Wall-clock cap for one OCR invocation; the child is killed on expiry. */
const OCR_TIMEOUT_MS = 90_000

const EXT_BY_MEDIA_TYPE: Readonly<Partial<Record<ImageMediaType, string>>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/** A rectangular image region with an optional label and detected text. */
export type OcrRegion = {
  bbox: number[]
  kind?: 'text' | 'shape'
  text?: string
}

/** An object detected by YOLO. */
export interface OcrObject {
  label: string
  bbox: number[]
  confidence: number
}

/** Structured image facts extracted by the local Python script. */
export interface OcrText {
  full_text: string
  lines: string[]
  regions: OcrRegion[]
  dominant_colors: string[]
  objects: OcrObject[]
  notes: string[]
  warnings: string[]
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
 * @returns the extracted text plus layout regions, dominant colors, objects and notes.
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
    const stdout = await spawnPython(config.pythonPath, [scriptPath, tmpPath, configDir])
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
    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

    const lines = asStringArray(record.lines)
    const fullText = typeof record.full_text === 'string' ? record.full_text : lines.join('\n')

    const regions: OcrRegion[] = Array.isArray(record.regions)
      ? record.regions.flatMap((item): OcrRegion[] => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
        const entry = item as Record<string, unknown>
        if (!Array.isArray(entry.bbox)) return []
        const bbox = entry.bbox.filter((n): n is number => typeof n === 'number')
        if (bbox.length !== 4) return []
        const region: OcrRegion = { bbox }
        if (entry.kind === 'text' || entry.kind === 'shape') region.kind = entry.kind
        if (typeof entry.text === 'string') region.text = entry.text
        return [region]
      })
      : []

    const objects: OcrObject[] = Array.isArray(record.objects)
      ? record.objects.flatMap((item): OcrObject[] => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
        const entry = item as Record<string, unknown>
        if (!Array.isArray(entry.bbox) || typeof entry.label !== 'string') return []
        const bbox = entry.bbox.filter((n): n is number => typeof n === 'number')
        if (bbox.length !== 4) return []
        return [{ label: entry.label, bbox, confidence: typeof entry.confidence === 'number' ? entry.confidence : 0 }]
      })
      : []

    return {
      full_text: fullText,
      lines,
      regions,
      dominant_colors: asStringArray(record.dominant_colors),
      objects,
      notes: asStringArray(record.notes),
      warnings: asStringArray(record.warnings),
    }
  } finally {
    await rm(tmpPath, { force: true })
  }
}
