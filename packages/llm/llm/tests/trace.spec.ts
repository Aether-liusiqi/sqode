import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@liusiqi-dev/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerateOptions } from '../src/index.ts'

/**
 * The trace exists because a diagnostic that cannot be read costs a build. It is
 * gated by a marker file rather than an environment variable, because the desktop
 * Host receives an explicit environment object: a variable set in the launching
 * shell need not reach the process that makes the request.
 */

/** A fake home holding the `.sqode` directory the trace writes into. */
function fakeHome(): { home: string; marker: string; log: string } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-llm-trace-'))
  const dir = join(home, '.sqode')
  mkdirSync(dir)
  return { home, marker: join(dir, 'llm-trace.enabled'), log: join(dir, 'llm-trace.log') }
}

async function runtimeUnder(home: string): Promise<{ stream: (options: GenerateOptions) => AsyncIterable<unknown> }> {
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os')
    return { ...actual, homedir: () => home }
  })
  const { LlmRuntime } = await import('../src/index.ts')
  return new LlmRuntime(new Context())
}

const REQUEST = {
  provider: 'trace-provider',
  model: 'trace-model',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
  tools: [{ name: 'read', description: 'read', parameters: {} }],
} as unknown as GenerateOptions

afterEach(() => {
  vi.resetModules()
})

describe('request trace', () => {
  it('appends one line per stream call when the marker exists', async () => {
    const { home, marker, log } = fakeHome()
    writeFileSync(marker, '')
    const llm = await runtimeUnder(home)

    // No adapter is registered: the call fails after the trace is written, which
    // is exactly the guarantee under test.
    try {
      for await (const chunk of llm.stream(REQUEST)) void chunk
    } catch {
      // Dispatch failure is not the subject of this test.
    }

    const text = readFileSync(log, 'utf8')
    expect(text).toContain('trace-provider/trace-model')
    expect(text).toContain('messages=1')
    expect(text).toContain('tools=1')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('writes nothing when the marker is absent', async () => {
    const { home, log } = fakeHome()
    const llm = await runtimeUnder(home)

    try {
      for await (const chunk of llm.stream(REQUEST)) void chunk
    } catch {
      // Ignored: this test asserts the absence of a trace file.
    }

    expect(() => readFileSync(log, 'utf8')).toThrow()
  })
})
