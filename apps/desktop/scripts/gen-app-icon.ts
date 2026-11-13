/** Generate the app icon ICO from the cropped SVG. Run via tsx. */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { packIco } from './render-tray-icon.ts'

const svg = readFileSync(fileURLToPath(new URL('../resources/icon-windows.svg', import.meta.url)))
const sizes = [16, 24, 32, 48, 64, 128, 256] as const

async function main(): Promise<void> {
  const entries = []
  for (const size of sizes) {
    const png = await sharp(svg, { density: 72 * size / 660 })
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
