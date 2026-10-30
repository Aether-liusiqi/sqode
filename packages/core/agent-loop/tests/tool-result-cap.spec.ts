/**
 * Capping tool results: a large result keeps its head and tail, states how much was
 * omitted, and leaves the whole text in a file the model can read back. Everything
 * under the limit must pass through untouched, because most results are small.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Session } from '@liusiqi-dev/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { capToolResultContent } from '../src/tool-calls.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function sessionAt(cwd?: string): Session {
  return { header: cwd === undefined ? {} : { cwd } } as unknown as Session
}

const block = { id: 'call-1', name: 'bash', arguments: {} } as never

function text(content: readonly { type: string; text?: string }[]): string {
  return content.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n')
}

describe('capToolResultContent', () => {
  it('keeps a small result exactly as the tool produced it', () => {
    const content = [{ type: 'text' as const, text: 'short output' }]
    expect(capToolResultContent(sessionAt(), 1, 1, block, content)).toBe(content)
  })

  it('leaves a result under the 30k limit alone', () => {
    const content = [{ type: 'text' as const, text: 'y'.repeat(29_000) }]
    expect(capToolResultContent(sessionAt(), 1, 1, block, content)).toBe(content)
  })

  it('caps a large result and spills the whole text beside the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tool-cap-'))
    roots.push(root)
    const whole = 'A'.repeat(20_000) + 'B'.repeat(20_000)

    const capped = capToolResultContent(sessionAt(root), 2, 3, block, [{ type: 'text', text: whole }])
    const shown = text(capped)

    expect(shown.length).toBeLessThan(whole.length)
    expect(shown.startsWith('A'.repeat(100))).toBe(true)
    expect(shown.endsWith('B'.repeat(100))).toBe(true)
    expect(shown).toContain('[output truncated: 40000 characters total')

    const spill = /Full text saved to (.+?); read that file/.exec(shown)?.[1]
    expect(spill).toBeDefined()
    expect(readFileSync(spill as string, 'utf8')).toBe(whole)
  })

  it('still caps when the session has no workspace directory to spill into', () => {
    const whole = 'X'.repeat(40_000)
    const shown = text(capToolResultContent(sessionAt(), 1, 1, block, [{ type: 'text', text: whole }]))

    expect(shown).toContain('The full text was not saved')
    expect(shown.length).toBeLessThan(whole.length)
  })
})
