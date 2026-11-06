/**
 * Load-time validation and routed-model policy resolution for compaction-basic.
 *
 * @module @liusiqi-dev/sqh-compaction-basic/config
 */

import type { LlmCallConfig } from '@liusiqi-dev/sqh-llm'
import { deepFreeze } from '@liusiqi-dev/sqh-util-values'
import type {
  BasicCompactionConfig,
  CompactionPolicyConfig,
  ModelCompactPolicyConfig,
  ResolvedCompactSpec,
  ResolvedConfig,
  ResolvedRetention,
  ResolvedTargetPolicy,
} from './types.ts'

/** Default request-pressure fraction for every routed model. */
const DEFAULT_THRESHOLD_RATIO = 0.85

/**
 * Default margin below the threshold. It is a margin, not a second budget: the
 * output floor already reserves room to answer, so this only absorbs one
 * oversized tool result. A wider value is what made a 100k route compact on
 * every turn.
 */
const DEFAULT_HEADROOM_TOKENS = 4_000

/** Default completion cap for one checkpoint, independent of that margin. */
const DEFAULT_SUMMARY_MAX_TOKENS = 65_536

/** Default verbatim-tail fraction for every routed model. */
const DEFAULT_RETAIN_RATIO = 0.06

/**
 * Smallest share of a window the pressure budget must keep for the configured
 * headroom to be worth its cost. Below this the headroom is dropped: it would
 * leave the route compacting nearly every turn, and each of those rewrites the
 * surface and discards the provider's prefix cache.
 */
/** Output room the threshold always leaves, so a trigger never lands on the wall. */
const MIN_OUTPUT_TOKENS = 16_000

/**
 * Where to warn that compaction is coming, given the threshold it will fire at.
 *
 * The gap is proportional on a wide window and floored on a narrow one: 8% of a
 * 1M threshold is a generous 60k, while 8% of a 100k threshold would be a single
 * step. A fixed floor keeps the small route usable without over-warning the large
 * one.
 * @param thresholdTokens - the threshold pressure compaction fires at.
 * @returns the pressure at which the operator should be told to wrap up.
 */
export function noticeThresholdTokens(thresholdTokens: number): number {
  const gap = Math.max(MIN_NOTICE_GAP_TOKENS, Math.floor(thresholdTokens * NOTICE_GAP_RATIO))
  return Math.max(0, thresholdTokens - gap)
}

/** Smallest gap between the warning and the compaction it warns about. */
const MIN_NOTICE_GAP_TOKENS = 8_000

/** Share of the threshold used as the gap on windows wide enough to afford it. */
const NOTICE_GAP_RATIO = 0.08

/** Largest share of a window the configured headroom may claim. */
const MAX_HEADROOM_SHARE = 0.2

/** Fields shared by top-level defaults and exact-target overrides. */
const POLICY_CONFIG_KEYS = [
  'thresholdRatio',
  'headroomTokens',
  'retainRatio',
  'retainTokens',
  'summarizationProvider',
  'summarizationModel',
  'maxTokens',
  'compactionRetries',
  'maxOverflowRetries',
] as const

/** Complete public top-level configuration key set. */
const BASIC_COMPACT_CONFIG_KEYS: ReadonlySet<string> = new Set([
  ...POLICY_CONFIG_KEYS,
  'modelPolicies',
  'auto',
])

/** Complete exact-target override key set. */
const MODEL_POLICY_KEYS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  ...POLICY_CONFIG_KEYS,
])

/** Target-specific pressure configuration failure eligible for warning suppression. */
export class TargetPressureConfigError extends Error {
  /**
   * @param targetKey - exact provider/model route used as the warning key.
   * @param message - actionable configuration failure detail.
   */
  constructor(readonly targetKey: string, message: string) {
    super(message)
  }
}

/**
 * Resolve and validate service defaults plus exact-target partial overrides.
 * @param config - untrusted plugin configuration after Loader normalization.
 * @returns detached immutable defaults and validated exact-target overrides.
 */
export function resolveConfig(config: BasicCompactionConfig = {}): ResolvedConfig {
  validateKeys(config, BASIC_COMPACT_CONFIG_KEYS, 'BasicCompactionConfig')
  validatePolicy(config, 'BasicCompactionConfig')
  if (config.auto !== undefined && typeof config.auto !== 'boolean') {
    throw new Error('BasicCompactionConfig: auto must be a boolean')
  }

  // The margin and the completion cap answer different questions: the margin is
  // how close to the wall a turn may run, the cap is how long a checkpoint may be.
  // They shared one default, which tied a four-thousand-token margin to a
  // four-thousand-token summary the model cannot finish.
  const headroomTokens = config.headroomTokens ?? DEFAULT_HEADROOM_TOKENS
  const maxTokens = config.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS
  assertPositiveInteger('BasicCompactionConfig.maxTokens', maxTokens)
  const thresholdRatio = config.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO
  const retention = resolveRetention(config, { retainRatio: DEFAULT_RETAIN_RATIO })
  validateRatioRetention(thresholdRatio, retention, 'BasicCompactionConfig')
  const modelPolicies = resolveModelPolicies(config.modelPolicies)
  for (const [index, policy] of modelPolicies.entries()) {
    assertPositiveInteger(
      `BasicCompactionConfig: modelPolicies[${index}].maxTokens`,
      policy.maxTokens ?? maxTokens,
    )
    validateRatioRetention(
      policy.thresholdRatio ?? thresholdRatio,
      resolveRetention(policy, retention),
      `BasicCompactionConfig: modelPolicies[${index}]`,
    )
  }

  return deepFreeze({
    thresholdRatio,
    headroomTokens,
    ...retention,
    summarizationProvider: config.summarizationProvider ?? '',
    summarizationModel: config.summarizationModel ?? '',
    maxTokens,
    compactionRetries: config.compactionRetries ?? 1,
    // One retry cannot carry a conversation several times the window back under
    // it: each pass removes roughly one summarization budget, so a 2.3x overflow
    // needs a second and usually a third pass.
    maxOverflowRetries: config.maxOverflowRetries ?? 4,
    modelPolicies,
    auto: config.auto ?? true,
  })
}

/**
 * Merge the exact provider/model override over the validated default policy.
 * @param config - validated service defaults and override table.
 * @param target - exact durable provider/model route to match.
 * @returns detached immutable policy before model-capacity scaling.
 */
export function resolveTargetPolicy(
  config: ResolvedConfig,
  target: Pick<LlmCallConfig, 'provider' | 'model'>,
): ResolvedTargetPolicy {
  const override = config.modelPolicies.find(policy => (
    policy.provider === target.provider && policy.model === target.model
  ))
  const inheritedRetention: ResolvedRetention = config.retainTokens === undefined
    ? { retainRatio: config.retainRatio }
    : { retainTokens: config.retainTokens }
  return deepFreeze({
    target: { provider: target.provider, model: target.model },
    thresholdRatio: override?.thresholdRatio ?? config.thresholdRatio,
    headroomTokens: override?.headroomTokens ?? config.headroomTokens,
    ...resolveRetention(override ?? {}, inheritedRetention),
    summarizationProvider: override?.summarizationProvider ?? config.summarizationProvider,
    summarizationModel: override?.summarizationModel ?? config.summarizationModel,
    maxTokens: override?.maxTokens ?? config.maxTokens,
    compactionRetries: override?.compactionRetries ?? config.compactionRetries,
    maxOverflowRetries: override?.maxOverflowRetries ?? config.maxOverflowRetries,
  })
}

/**
 * Scale one routed policy into concrete token budgets for its model capacity.
 *
 * Pressure is capped by both the window fraction and the capacity remaining
 * after the routed output reservation plus compaction headroom. Retention scales
 * the message budget before headroom is deducted.
 *
 * @param policy - merged policy for the exact routed target.
 * @param contextWindow - positive adapter-owned capacity for that target.
 * @param reservedCompletionTokens - output tokens one routed request reserves.
 * @returns detached immutable pressure and retention budgets.
 */
export function resolveCompactSpec(
  policy: ResolvedTargetPolicy,
  contextWindow: number,
  reservedCompletionTokens: number,
): ResolvedCompactSpec {
  const targetKey = `${policy.target.provider}/${policy.target.model}`
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
    throw new TargetPressureConfigError(
      targetKey,
      `BasicCompactionConfig: contextWindow (${contextWindow}) must be a positive integer`,
    )
  }
  if (!Number.isInteger(reservedCompletionTokens) || reservedCompletionTokens < 0) {
    throw new TargetPressureConfigError(
      targetKey,
      `BasicCompactionConfig: reservedCompletionTokens (${reservedCompletionTokens}) `
      + 'must be a non-negative integer',
    )
  }
  if (reservedCompletionTokens >= contextWindow) {
    throw new TargetPressureConfigError(
      targetKey,
      `compaction-basic: ${targetKey} reserves ${reservedCompletionTokens} completion tokens `
      + `of its ${contextWindow}-token context window, leaving no message budget; configure `
      + "the adapter model's contextWindow above the effective request maxTokens",
    )
  }
  // The threshold follows the window, not the configured output cap: a reserve
  // tuned for a 1M route used to starve a 100k one to a third of its window, so
  // compaction fired within one turn of finishing and every firing rewrote the
  // surface, dropping the provider's prefix cache with it. What the threshold
  // must still leave is room to answer at all, so the output floor is a share of
  // the window rather than whatever the adapter happens to request.
  // The floor protects a route that reserves output; a route that reserves none
  // is not spending that room and keeps the full window-relative threshold.
  const outputFloorTokens = Math.min(MIN_OUTPUT_TOKENS, reservedCompletionTokens)
  // A headroom sized for a wide window crushes a narrow one: 65,536 of a 100k
  // window leaves 18,464, so every turn tripped the threshold. It is a margin,
  // not a second budget, so it never claims more than a fifth of the window.
  const headroomTokens = Math.min(
    policy.headroomTokens,
    Math.floor(contextWindow * MAX_HEADROOM_SHARE),
  )
  const thresholdTokens = Math.floor(Math.min(
    contextWindow * policy.thresholdRatio,
    contextWindow - outputFloorTokens - headroomTokens,
  ))
  if (thresholdTokens < 1) {
    throw new TargetPressureConfigError(
      targetKey,
      `compaction-basic: ${targetKey} reserves ${outputFloorTokens} output tokens `
      + `and ${headroomTokens} headroom tokens of its ${contextWindow}-token context `
      + 'window, leaving no pressure budget; reduce the effective request maxTokens or '
      + 'compaction headroomTokens, or configure a larger adapter model contextWindow',
    )
  }
  // Retention is a share of the window, so one compaction always frees the same
  // share of the context: sizing it against the message budget let a route with a
  // large output reservation keep far more than its ratio implied, so every
  // compaction left the Session close to the wall again.
  const retainTokens = policy.retainTokens === undefined
    ? Math.floor(contextWindow * policy.retainRatio)
    : policy.retainTokens
  if (retainTokens >= thresholdTokens) {
    throw new TargetPressureConfigError(
      targetKey,
      `BasicCompactionConfig: ${policy.target.provider}/${policy.target.model} retainTokens `
      + `(${retainTokens}) must be less than threshold tokens ${thresholdTokens}`,
    )
  }
  return deepFreeze({
    target: { ...policy.target },
    contextWindow,
    thresholdRatio: policy.thresholdRatio,
    thresholdTokens,
    retainTokens,
    summarizationProvider: policy.summarizationProvider,
    summarizationModel: policy.summarizationModel,
    maxTokens: policy.maxTokens,
    compactionRetries: policy.compactionRetries,
    maxOverflowRetries: policy.maxOverflowRetries,
  })
}

/** Choose an explicit retention form or inherit the already-resolved fallback. */
function resolveRetention(
  config: CompactionPolicyConfig,
  fallback: ResolvedRetention,
): ResolvedRetention {
  if (config.retainTokens !== undefined) return { retainTokens: config.retainTokens }
  if (config.retainRatio !== undefined) return { retainRatio: config.retainRatio }
  return fallback
}

/** Reject a capacity-independent retention conflict at plugin load. */
function validateRatioRetention(
  thresholdRatio: number,
  retention: ResolvedRetention,
  name: string,
): void {
  if (retention.retainRatio !== undefined && retention.retainRatio >= thresholdRatio) {
    throw new Error(
      `${name}: retainRatio (${retention.retainRatio}) must be less than `
      + `the resolved thresholdRatio (${thresholdRatio})`,
    )
  }
}

/** Validate, detach, and reject duplicate exact-target policies. */
function resolveModelPolicies(configured: unknown): ModelCompactPolicyConfig[] {
  if (configured === undefined) return []
  if (!Array.isArray(configured)) {
    throw new Error('BasicCompactionConfig: modelPolicies must be an array')
  }
  const seen = new Set<string>()
  return configured.map((source: unknown, index) => {
    const name = `BasicCompactionConfig: modelPolicies[${index}]`
    assertModelPolicy(source, name)
    const key = `${source.provider}\u0000${source.model}`
    if (seen.has(key)) {
      throw new Error(
        `BasicCompactionConfig: duplicate model policy for ${source.provider}/${source.model}`,
      )
    }
    seen.add(key)
    return { ...source }
  })
}

/** Validate one untrusted exact-target override and narrow its public type. */
function assertModelPolicy(
  source: unknown,
  name: string,
): asserts source is ModelCompactPolicyConfig {
  if (!isUnknownRecord(source)) throw new Error(`${name} must be an object`)
  validateKeys(source, MODEL_POLICY_KEYS, name)
  assertNonEmptyString(`${name}.provider`, source.provider)
  assertNonEmptyString(`${name}.model`, source.model)
  validatePolicy(source, name)
}

/** Validate the fields common to defaults and exact-target partial overrides. */
function validatePolicy(
  config: CompactionPolicyConfig | Record<string, unknown>,
  name: string,
): void {
  const thresholdRatio = config.thresholdRatio
  const headroomTokens = config.headroomTokens
  const retainRatio = config.retainRatio
  const retainTokens = config.retainTokens
  const maxTokens = config.maxTokens
  const compactionRetries = config.compactionRetries
  const maxOverflowRetries = config.maxOverflowRetries
  if (thresholdRatio !== undefined) assertRatio(`${name}.thresholdRatio`, thresholdRatio)
  if (headroomTokens !== undefined) assertNonNegativeInteger(`${name}.headroomTokens`, headroomTokens)
  if (retainRatio !== undefined) assertRatio(`${name}.retainRatio`, retainRatio)
  if (retainTokens !== undefined) assertNonNegativeInteger(`${name}.retainTokens`, retainTokens)
  if (retainRatio !== undefined && retainTokens !== undefined) {
    throw new Error(`${name}: retainRatio and retainTokens are mutually exclusive`)
  }
  if (maxTokens !== undefined) assertPositiveInteger(`${name}.maxTokens`, maxTokens)
  if (compactionRetries !== undefined) {
    assertNonNegativeInteger(`${name}.compactionRetries`, compactionRetries)
  }
  if (maxOverflowRetries !== undefined) {
    assertNonNegativeInteger(`${name}.maxOverflowRetries`, maxOverflowRetries)
  }

  validateSummarizationPair(config, name)
}

/** Require one scope to omit, clear, or replace the summarization target as a pair. */
function validateSummarizationPair(
  config: CompactionPolicyConfig | Record<string, unknown>,
  name: string,
): void {
  const provider = config.summarizationProvider
  const model = config.summarizationModel
  if (provider !== undefined && typeof provider !== 'string') {
    throw new Error(`${name}.summarizationProvider must be a string`)
  }
  if (model !== undefined && typeof model !== 'string') {
    throw new Error(`${name}.summarizationModel must be a string`)
  }
  if (provider === undefined && model === undefined) return
  if (provider === undefined || model === undefined
    || (provider.length === 0) !== (model.length === 0)) {
    throw new Error(
      `${name}: summarizationProvider and summarizationModel must be set together `
      + 'as an empty or non-empty pair',
    )
  }
}

/** Reject stale or misspelled keys before defaults can hide them. */
function validateKeys(config: object, keys: ReadonlySet<string>, name: string): void {
  for (const key of Object.keys(config)) {
    if (!keys.has(key)) throw new Error(`${name}: unknown key "${key}"`)
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

function assertPositiveInteger(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} (${String(value)}) must be a positive integer`)
  }
}

function assertNonNegativeInteger(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} (${String(value)}) must be a non-negative integer`)
  }
}

function assertRatio(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} (${String(value)}) must be a number in (0, 1]`)
  }
}
