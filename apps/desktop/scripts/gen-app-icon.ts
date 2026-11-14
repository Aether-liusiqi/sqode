/** Generate the app icon ICO from the cropped SVG. Run via tsx. */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { packIco } from './render-tray-icon.ts'

const svg = readFileSync(fileURLToPath(new URL('../resources/icon-windows.svg', import.meta.url)))
const sizes = [16, 24, 32, 48, 64, 128, 256] as const

// Base viewBox: the glyph is already cropped to fill ~92% of the frame. This is
// the approved framing for the desktop (large frames: 64/128/256) and must stay.
const BASE_VB: [number, number, number, number] = [180, 180, 660, 660]

// Measure the opaque glyph bounding box (in viewBox 180..840 units) once, then
// derive a tight *square* viewBox for the small (taskbar) frames so the logo
// reads as large as possible without clipping the orange shape. The logo already
// fills ~92% of the frame, so the largest non-clipping crop is edge-to-edge
// (~100% fill, roughly +8% over the desktop framing). A literal +1/6 would cut
// the logo edge, which we avoid.
async function glyphViewBox(): Promise<[number, number, number, number]> {
  const sample = 1024
  const { data, info } = await sharp(svg, { density: (72 * sample) / 660 })
    .resize(sample, sample)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alphaIdx = info.channels - 1
  let minX = sample, minY = sample, maxX = -1, maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + alphaIdx] ?? 0
      if (alpha > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  // Pixel bounds -> viewBox units (180..840 maps to 0..sample).
  const toVB = (p: number) => 180 + (p / sample) * 660
  const x0 = toVB(minX), y0 = toVB(minY), x1 = toVB(maxX), y1 = toVB(maxY)
  // Square, centered on the glyph, zero margin (edge-to-edge, no distortion).
  const side = Math.max(x1 - x0, y1 - y0)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return [cx - side / 2, cy - side / 2, side, side]
}

function withViewBox(buf: Buffer, vb: [number, number, number, number]): Buffer {
  const next = buf.toString('utf8').replace(/viewBox="[^"]*"/, `viewBox="${vb.map(n => n.toFixed(2)).join(' ')}"`)
  return Buffer.from(next, 'utf8')
}

async function main(): Promise<void> {
  const tightVB = await glyphViewBox()
  const entries = []
  for (const size of sizes) {
    // Taskbar / small frames: tight crop so the logo reads larger.
    // Desktop / large frames: keep the approved 92%-fill framing unchanged.
    const vb = size <= 48 ? tightVB : BASE_VB
    const frameSvg = withViewBox(svg, vb)
    const png = await sharp(frameSvg, { density: (72 * size) / vb[2] })
      .resize(size, size)
      .png()
      .toBuffer()
    entries.push({ size, png })
  }
  const ico = packIco(entries)
  writeFileSync(fileURLToPath(new URL('../resources/icon-windows.ico', import.meta.url)), ico)
  console.info(`app icon: wrote ${entries.length} frames: ${entries.map(e => String(e.size)).join(', ')}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
