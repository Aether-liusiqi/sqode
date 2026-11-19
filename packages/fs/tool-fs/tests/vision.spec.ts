/**
 * Phase 3 unit checks for the integrated reader's vision path. The external
 * provider is verified with a mocked `fetch` and OCR with a mocked runner, so
 * no real API key or Python interpreter is needed here.
 *
 * NOTE: this does NOT verify a live provider end to end. A real check requires
 * a configured apiKey and is intentionally left unverified.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VisionConfig } from '../src/vision/config.ts'
import { DEFAULT_CONFIG, TOKENHUB_KEY_ENV, VISION_HOME_ENV, loadConfig } from '../src/vision/config.ts'
import { analyzeImage, wrapOcrText, wrapVisionResult } from '../src/vision/analyze.ts'
import { analyzeWithFailover } from '../src/vision/failover.ts'
import { runOcr } from '../src/vision/ocr.ts'
import { buildVisionMessages, parseVisionContent } from '../src/vision/prompt.ts'
import { callVisionProvider } from '../src/vision/providers.ts'

vi.mock('../src/vision/ocr.ts', () => ({ runOcr: vi.fn() }))

const OCR = { full_text: 'HELLO OCR 12345', lines: ['HELLO OCR 12345'] }
const VALID_CONTENT = JSON.stringify({
  summary: 'A red square with text',
  ocr: { full_text: 'HELLO', lines: ['HELLO'] },
  layout: { regions: [{ bbox: [0, 0, 10, 10], text: 'HELLO' }] },
  semantics: { scene: 'test scene', entities: ['square'], relations: ['text on square'] },
  visual: { dominant_colors: ['red'], style: null, notes: ['flat'] },
  uncertainty: ['colors approximate'],
})

function configOf(overrides: Partial<VisionConfig> = {}): VisionConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function reply(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>
let savedHome: string | undefined
let savedKey: string | undefined

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(runOcr).mockReset()
  vi.mocked(runOcr).mockResolvedValue(OCR)
  savedHome = process.env[VISION_HOME_ENV]
  savedKey = process.env[TOKENHUB_KEY_ENV]
  Reflect.deleteProperty(process.env, TOKENHUB_KEY_ENV)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (savedHome === undefined) Reflect.deleteProperty(process.env, VISION_HOME_ENV)
  else process.env[VISION_HOME_ENV] = savedHome
  if (savedKey === undefined) Reflect.deleteProperty(process.env, TOKENHUB_KEY_ENV)
  else process.env[TOKENHUB_KEY_ENV] = savedKey
})

describe('prompt', () => {
  it('builds a two-role message payload carrying the data URL', () => {
    const messages = buildVisionMessages('data:image/png;base64,AAAA')
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    const parts = messages[1]?.content
    expect(Array.isArray(parts)).toBe(true)
    if (!Array.isArray(parts)) return
    const image = parts.find(part => part.type === 'image_url')
    expect(image).toMatchObject({ image_url: { url: 'data:image/png;base64,AAAA' } })
  })

  it('parses a complete reply and applies defaults for missing optional fields', () => {
    const parsed = parseVisionContent(VALID_CONTENT)
    expect(parsed).not.toBeNull()
    expect(parsed?.summary).toBe('A red square with text')
    expect(parsed?.ocr.full_text).toBe('HELLO')
    expect(parsed?.layout.regions).toHaveLength(1)
    expect(parsed?.semantics.scene).toBe('test scene')
    expect(parsed?.visual.dominant_colors).toEqual(['red'])

    const minimal = parseVisionContent(JSON.stringify({ summary: 's', ocr: { full_text: 't' } }))
    expect(minimal?.ocr.lines).toEqual([])
    expect(minimal?.layout.regions).toEqual([])
    expect(minimal?.semantics.scene).toBeNull()
    expect(minimal?.visual.dominant_colors).toEqual([])
    expect(minimal?.uncertainty).toEqual([])
  })

  it('rejects non-JSON and replies missing core fields', () => {
    expect(parseVisionContent('not json')).toBeNull()
    expect(parseVisionContent('[]')).toBeNull()
    expect(parseVisionContent(JSON.stringify({ summary: 's' }))).toBeNull()
    expect(parseVisionContent(JSON.stringify({ ocr: { full_text: 't' } }))).toBeNull()
  })
})

describe('provider call', () => {
  it('posts to chat/completions with bearer auth and returns the assistant text', async () => {
    fetchMock.mockResolvedValue(reply({ choices: [{ message: { content: VALID_CONTENT } }] }))
    const content = await callVisionProvider(configOf({ apiKey: 'secret' }), Buffer.from('img'), 'image/png')
    expect(content).toBe(VALID_CONTENT)
    const args: unknown = fetchMock.mock.calls[0]
    expect(Array.isArray(args)).toBe(true)
    if (!Array.isArray(args)) return
    expect(args[0]).toBe('https://tokenhub.tencentmaas.com/v1/chat/completions')
    const options = args[1] as RequestInit
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>).authorization).toBe('Bearer secret')
    const body = JSON.parse(options.body as string) as { model: string; messages: unknown[] }
    expect(body.model).toBe('hy-vision-2.0-instruct')
    expect(body.messages).toHaveLength(2)
  })

  it('surfaces HTTP errors and malformed bodies', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, false, 500))
    await expect(callVisionProvider(configOf({ apiKey: 'k' }), Buffer.from('img'), 'image/png'))
      .rejects.toThrow('HTTP 500')
    fetchMock.mockResolvedValueOnce(reply({ choices: [] }))
    await expect(callVisionProvider(configOf({ apiKey: 'k' }), Buffer.from('img'), 'image/png'))
      .rejects.toThrow('no choices')
  })
})

describe('failover orchestration', () => {
  const data = Buffer.from('img')

  it('uses OCR without a key and never calls fetch', async () => {
    const outcome = await analyzeWithFailover(data, 'image/png', configOf(), '/tmp/cfg')
    expect(outcome.kind).toBe('ocr')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forces OCR when ocrFallback is fallback even with a key', async () => {
    const outcome = await analyzeWithFailover(
      data, 'image/png', configOf({ apiKey: 'k', ocrFallback: 'fallback' }), '/tmp/cfg',
    )
    expect(outcome.kind).toBe('ocr')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns vision analysis when the provider answers with valid JSON', async () => {
    fetchMock.mockResolvedValue(reply({ choices: [{ message: { content: VALID_CONTENT } }] }))
    const outcome = await analyzeWithFailover(
      data, 'image/png', configOf({ apiKey: 'k' }), '/tmp/cfg',
    )
    expect(outcome.kind).toBe('vision')
    expect(runOcr).not.toHaveBeenCalled()
    if (outcome.kind !== 'vision') return
    expect(outcome.parsed.ocr.full_text).toBe('HELLO')
  })

  it('degrades to OCR with a warning when the provider fails', async () => {
    fetchMock.mockResolvedValue(reply({}, false, 500))
    const outcome = await analyzeWithFailover(
      data, 'image/png', configOf({ apiKey: 'k' }), '/tmp/cfg',
    )
    expect(outcome.kind).toBe('ocr')
    expect(runOcr).toHaveBeenCalledTimes(1)
    if (outcome.kind !== 'ocr') return
    expect(outcome.warnings[0]).toContain('vision provider failed')
  })

  it('degrades to OCR when the provider returns unusable JSON', async () => {
    fetchMock.mockResolvedValue(reply({ choices: [{ message: { content: 'garbage' } }] }))
    const outcome = await analyzeWithFailover(
      data, 'image/png', configOf({ apiKey: 'k' }), '/tmp/cfg',
    )
    expect(outcome.kind).toBe('ocr')
    expect(runOcr).toHaveBeenCalledTimes(1)
  })
})

describe('wrappers and analyzeImage', () => {
  it('wraps vision and OCR results into the analysis schema', () => {
    const parsed = parseVisionContent(VALID_CONTENT)
    if (parsed === null) throw new Error('expected a parsed result')
    expect(wrapVisionResult('tencent-tokenhub-vision', parsed)).toMatchObject({
      provider: 'tencent-tokenhub-vision',
      result: { summary: 'A red square with text' },
      meta: { warnings: [] },
    })
    expect(wrapOcrText('T', ['T'])).toMatchObject({
      provider: 'local-ocr',
      meta: { warnings: ['DEGRADED: no vision model, used local RapidOCR'] },
    })
  })

  it('keeps the Phase 2 OCR result when no key is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-vision-test-'))
    try {
      process.env[VISION_HOME_ENV] = dir
      const result = await analyzeImage(Buffer.from('img'), 'image/png')
      expect(result.provider).toBe('local-ocr')
      expect(result.result.ocr.full_text).toBe('HELLO OCR 12345')
      expect(result.meta.warnings).toEqual(['DEGRADED: no vision model, used local RapidOCR'])
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('config key source', () => {
  it('reads the key from the user-level environment variable with defaults applied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-vision-key-'))
    try {
      process.env[VISION_HOME_ENV] = dir
      process.env[TOKENHUB_KEY_ENV] = '  env-key-xyz  '
      const config = await loadConfig(dir)
      expect(config.apiKey).toBe('env-key-xyz')
      expect(config.provider).toBe('tencent-tokenhub-vision')
      expect(config.baseUrl).toBe('https://tokenhub.tencentmaas.com/v1')
      expect(config.model).toBe('hy-vision-2.0-instruct')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lets the environment variable override a key stored in the config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-vision-key-'))
    try {
      await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'file-key' }))
      process.env[VISION_HOME_ENV] = dir
      process.env[TOKENHUB_KEY_ENV] = 'env-key'
      const config = await loadConfig(dir)
      expect(config.apiKey).toBe('env-key')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('falls back to the config file key only when the environment variable is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-vision-key-'))
    try {
      await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'file-key' }))
      process.env[VISION_HOME_ENV] = dir
      const config = await loadConfig(dir)
      expect(config.apiKey).toBe('file-key')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
