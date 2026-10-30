/**
 * Deployment knobs for the pruner: environment overrides are clamped so the emitted
 * head + marker + tail can never exceed the threshold, and explicit plugin config wins
 * over the environment.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { PRUNE_MARKER, resolveConfig } from '../src/index.ts'

const savedEnv = { ...process.env }
const NAMES = ['DSH_TOOL_PRUNE_THRESHOLD_CHARS', 'DSH_TOOL_PRUNE_HEAD_CHARS', 'DSH_TOOL_PRUNE_TAIL_CHARS'] as const

afterEach(() => {
  for (const name of NAMES) {
    if (savedEnv[name] === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = savedEnv[name]
  }
})

describe('pruner settings', () => {
  it('ships the 32,768 threshold that stays above the loop cap', () => {
    Reflect.deleteProperty(process.env, 'DSH_TOOL_PRUNE_THRESHOLD_CHARS')
    Reflect.deleteProperty(process.env, 'DSH_TOOL_PRUNE_HEAD_CHARS')
    Reflect.deleteProperty(process.env, 'DSH_TOOL_PRUNE_TAIL_CHARS')
    expect(resolveConfig()).toEqual({ thresholdChars: 32_768, headChars: 20_480, tailChars: 6_144 })
  })

  it('clamps environment overrides so the replacement fits', () => {
    process.env.DSH_TOOL_PRUNE_THRESHOLD_CHARS = '6000'
    process.env.DSH_TOOL_PRUNE_HEAD_CHARS = '999999'
    process.env.DSH_TOOL_PRUNE_TAIL_CHARS = '999999'

    const resolved = resolveConfig()
    const marker = Array.from(PRUNE_MARKER).length
    expect(resolved.thresholdChars).toBe(6_000)
    expect(resolved.headChars + marker + resolved.tailChars).toBeLessThanOrEqual(6_000)
  })

  it('prefers explicit plugin config over the environment', () => {
    process.env.DSH_TOOL_PRUNE_THRESHOLD_CHARS = '6000'
    expect(resolveConfig({ thresholdChars: 9_000 }).thresholdChars).toBe(9_000)
  })
})
