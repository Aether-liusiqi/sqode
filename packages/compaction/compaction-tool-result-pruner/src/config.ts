/** Configuration resolution for deterministic tool-result pruning. */

import { deepFreeze } from '@liusiqi-dev/dsh-util-values'
import type { ResolvedConfig, ToolResultPruneConfig } from './types.ts'

/** Fixed marker substituted for every removed middle span. */
export const PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n'

/**
 * Defaults for coding-agent tool output.
 *
 * The threshold sits above the agent loop's write-time cap (30k characters) on purpose:
 * a result the loop already trimmed must never be trimmed again, because every rewrite
 * of an earlier node changes the request prefix and costs a full re-prefill.
 */
export const DEFAULTS: ResolvedConfig = deepFreeze({
  thresholdChars: 32768,
  headChars: 20480,
  tailChars: 6144,
})

const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'thresholdChars',
  'headChars',
  'tailChars',
])

/** Environment overrides, clamped like every other deployment knob. */
const THRESHOLD_ENV = 'DSH_TOOL_PRUNE_THRESHOLD_CHARS'
const HEAD_ENV = 'DSH_TOOL_PRUNE_HEAD_CHARS'
const TAIL_ENV = 'DSH_TOOL_PRUNE_TAIL_CHARS'
const THRESHOLD_MIN = 4_000
const THRESHOLD_MAX = 128_000

/**
 * Read one integer setting, clamped into range.
 * @param name - environment variable name.
 * @param fallback - value used when absent or unparsable.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @returns the clamped integer.
 */
function readIntSetting(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim()
  const parsed = raw === undefined || raw === '' ? Number.NaN : Number(raw)
  // The fallback is clamped too: a small threshold must shrink the shipped 20k/6k
  // split, not collide with it.
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * Count Unicode code points without splitting surrogate pairs.
 * @param text - text to measure.
 * @returns the Unicode code-point count.
 */
export function codePointLength(text: string): number {
  return Array.from(text).length
}

/**
 * Resolve and validate pruning budgets.
 * @param config - raw plugin configuration.
 * @returns a detached deeply immutable configuration.
 */
export function resolveConfig(config: ToolResultPruneConfig = {}): ResolvedConfig {
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(
        `ToolResultPruneConfig: unknown key "${key}" `
        + '(allowed: thresholdChars, headChars, tailChars)',
      )
    }
  }

  // Precedence: explicit plugin config, then environment, then the shipped default.
  const thresholdChars = config.thresholdChars
    ?? readIntSetting(THRESHOLD_ENV, DEFAULTS.thresholdChars, THRESHOLD_MIN, THRESHOLD_MAX)
  const markerChars = codePointLength(PRUNE_MARKER)
  const headChars = config.headChars
    ?? readIntSetting(HEAD_ENV, DEFAULTS.headChars, 0, Math.max(0, thresholdChars - markerChars))
  const tailChars = config.tailChars
    ?? readIntSetting(TAIL_ENV, DEFAULTS.tailChars, 0, Math.max(0, thresholdChars - markerChars - headChars))

  const resolved: ResolvedConfig = { thresholdChars, headChars, tailChars }
  assertPositiveInteger('thresholdChars', resolved.thresholdChars)
  assertNonNegativeInteger('headChars', resolved.headChars)
  assertNonNegativeInteger('tailChars', resolved.tailChars)

  const emittedChars = resolved.headChars
    + codePointLength(PRUNE_MARKER)
    + resolved.tailChars
  if (emittedChars > resolved.thresholdChars) {
    throw new Error(
      `ToolResultPruneConfig: headChars + marker + tailChars (${emittedChars}) `
      + `must be at most thresholdChars (${resolved.thresholdChars})`,
    )
  }
  return deepFreeze(structuredClone(resolved))
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`ToolResultPruneConfig: ${name} (${value}) must be a positive integer`)
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`ToolResultPruneConfig: ${name} (${value}) must be a non-negative integer`)
  }
}
