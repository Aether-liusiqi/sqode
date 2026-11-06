/**
 * Default one-shot summarization and durable checkpoint framing.
 *
 * @module @liusiqi-dev/sqh-compaction-basic/summarizer
 */

import type { Context } from '@liusiqi-dev/cordis'
import {
  CONTEXT_WINDOW_EXCEEDED_CODE, BlockAssembler, LlmError, contentHasImage, isContextWindowExceededError,
} from '@liusiqi-dev/sqh-llm'
import { deepFreeze } from '@liusiqi-dev/sqh-util-values'
import type {
  ContentBlock, FinishReason, GenerateOptions, Message, RequestMessage, TokenUsage, ToolSchema,
} from '@liusiqi-dev/sqh-llm'
import type { Agent } from '@liusiqi-dev/sqh-agent'

interface SummaryConfig {
  readonly summarizationProvider: string
  readonly summarizationModel: string
  readonly maxTokens: number
  /**
   * How many prompt tokens one summarization call may replay. Absent means the
   * caller did not resolve a window, and the replay is sent whole.
   */
  readonly promptBudget?: number
}

/** Tags wrapping the structured summary inside the landed checkpoint node. */
const SUMMARY_OPEN_TAG = '<compacted-summary>'
const SUMMARY_CLOSE_TAG = '</compacted-summary>'

/**
 * The summarization directive, delivered as the FINAL user message after the
 * replayed conversation rather than as a distinct summarizer system prompt.
 * Keeping the conversation's own system prompt, tools, and message prefix in
 * front of it makes the auxiliary call a genuine prefix of the last routed
 * request, so the provider's KV cache is reused instead of invalidated.
 */
const COMPACTION_INSTRUCTION = [
  'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.',
  '',
  'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.',
  '',
  '## Primary Request and Intent',
  "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
  '',
  '## Key Technical Concepts',
  '- [technologies, frameworks, patterns, and conventions in play]',
  '',
  '## Files and Code',
  '- [exact path, its size in characters or lines, and one line on why it matters; list the most recently touched files first]',
  '',
  '## Errors and Fixes',
  '- [error: how it was resolved, plus any related user feedback]',
  '',
  '## Pending Jobs',
  '- [explicitly requested work not yet completed]',
  '',
  '## All User Messages',
  '- [every message the user sent, in order, each a direct quote in the user\'s own words — including short corrections, one-line questions, and mid-course changes. Never paraphrase: the exact wording is the requirement, and no later turn can reconstruct it]',
  '',
  '## Problem Solving',
  '- [what was tried and ruled out, and why: conclusions that must not be re-litigated]',
  '',
  '## Current Work',
  '- [precisely what was in progress at this checkpoint]',
  '',
  '## Next Step',
  '- [the single next action, directly in line with the most recent request; quote that request verbatim, and state any tool or environment constraint learned the hard way, or "(none)"]',
  '',
  '## Critical Context',
  '- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]',
  '',
  'Rules:',
  '- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.',
  '- Capture user feedback and explicit instructions faithfully, especially corrections.',
  '- Do NOT mention this summarization request or that the context was compacted.',
  '- Output only the checkpoint text: do not call any tool or take any other action.',
  '- Keep the whole checkpoint under 1600 words. A checkpoint that grows without bound defeats the compaction that produced it.',
  '- The full transcript stays on disk after this checkpoint, so exact wording, code, and command output remain recoverable: summarize what a reader must know, not what they could re-read.',
  '- Spend detail by relevance, not evenly: the newest work gets names, paths, numbers, and quoted instructions; work from earlier in the same task keeps its conclusions and the files it touched; work that ended, was abandoned, or belongs to an unrelated request gets one line at most, and may be dropped when the current task does not depend on it. A checkpoint that carries every past thread equally spends the next window on work nobody is doing.',
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint, and this is a second compaction of an already compacted conversation. Carry its "Primary Request and Intent" and "Pending Jobs" entries forward UNCHANGED — they record what the user actually asked for, which no later turn can reconstruct — and rewrite only the account of the work: keep still-true facts, drop stale ones, merge newer information under the same structure.`,
].join('\n')

/**
 * Attempts one summarization spends shrinking its own replay after the target
 * refuses the prompt as too long. Each attempt is a provider round-trip that the
 * target rejects immediately, so this only bounds a recovery path that otherwise
 * fails the compaction outright.
 */
const MAX_SUMMARY_SHRINK_ATTEMPTS = 10

/**
 * Floor for a shrunk completion cap. The structured checkpoint runs a few
 * thousand tokens, and a model cut off at the cap produces no usable summary at
 * all — compaction reads that truncation as a failed attempt — so output budget
 * is the last thing this gives back, never the first.
 */
const MIN_SUMMARY_MAX_TOKENS = 4_096

/** Fraction of the replayed turns dropped per shrink attempt. */
const SUMMARY_TRIM_FRACTION = 4

/**
 * Characters one token is assumed to carry when a replay is divided into
 * portions. Deliberately low: undercounting tokens would put a portion back over
 * the window it was split to fit.
 */
const SUMMARY_CHARS_PER_TOKEN = 3

/**
 * Ceiling on portions one summarization may make. A conversation needing more
 * than this is beyond what ordered re-summarization can preserve, and trimming
 * (which says so in the checkpoint) is the honest answer.
 */
const MAX_SUMMARY_PORTIONS = 12

/**
 * Added to the directive once a turn has been dropped from the replay. Without
 * it the checkpoint reads as a full record of a conversation whose beginning the
 * summarizer never saw.
 */
const TRIMMED_REPLAY_NOTICE = '\n\n'
  + '- The transcript above begins partway through the conversation: its earliest span was omitted to fit'
  + ' this request. Say so under "## Critical Context" — for example that the record starts after the'
  + ' beginning — so the next reader knows what cannot be recovered from this checkpoint.'

/** Framing that makes the replacement user message established context. */
const CHECKPOINT_PREAMBLE =
  'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'

/**
 * The replayed conversation surface the summarizer condenses. Reproducing the
 * last routed request's system prompt, tools, and leading messages verbatim
 * lets the auxiliary call reuse the provider's warm prefix cache; the trailing
 * compaction instruction is then the only novel input.
 */
export interface SummarizationInput {
  /** The conversation's tool schemas, reused for prefix-cache alignment; absent when the request carried none. */
  readonly tools?: readonly ToolSchema[]
  /** The derived system head, when present, followed by the shadowed region in surface order. */
  readonly messages: readonly Message[]
}

/** Safe summary content plus the exact auxiliary call envelope recorded with it. */
export type SummaryResult = {
  summary: ContentBlock[]
  provider: string
  model: string
  maxTokens?: number
  /** Provider-reported usage for this summarization request. */
  usage?: TokenUsage
} & (
  | {
    /** Complete provider output before the text-only summary projection. */
    rawOutput: ContentBlock[]
    /** Identifies exactly one call through this context's `ctx.llm.stream()`. */
    llmStreamCall: true
  }
  | {
    /** Optional complete output from an unmarked template, remote, or other summarizer. */
    rawOutput?: ContentBlock[]
    /** An unmarked result does not identify a call through this context's LLM seam. */
    llmStreamCall?: never
  }
)

/**
 * Run the default cache-reusing `ctx.llm.stream()` summarization call: replay
 * the conversation prefix, then append the compaction instruction as the final
 * user message so the provider's warm prefix cache is reused.
 *
 * A target that refuses the replay as longer than its own window is answered by
 * shrinking the replay and trying again, because that refusal is precisely what
 * the caller asked compaction to repair: replaying a near-window context to the
 * window that rejected it fails identically, and the Session would then have no
 * way back under the limit.
 * @param ctx - context providing the LLM service.
 * @param config - resolved backend configuration.
 * @param input - replayed conversation prefix (system, tools, and leading messages) to condense.
 * @param agent - supplies routed-model history, fallback model, and session id.
 * @param signal - optional cancellation forwarded to the adapter.
 * @returns safe text-only summary blocks and the exact call envelope and output.
 */
export async function summarizeWithLlm(
  ctx: Context,
  config: SummaryConfig,
  input: SummarizationInput,
  agent: Agent,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  const latest = agent.session.requestHeader()?.config
  const configured = config.summarizationProvider.length === 0
    ? undefined
    : { provider: config.summarizationProvider, model: config.summarizationModel }
  const agentTarget = agent.options.provider !== undefined
    && agent.options.provider.length > 0
    && agent.options.model !== undefined
    && agent.options.model.length > 0
    ? { provider: agent.options.provider, model: agent.options.model }
    : undefined
  const target = configured ?? latest ?? agentTarget
  if (target === undefined) {
    throw new Error(
      'no provider/model available for summarization: set both BasicCompactionConfig summarization fields, route one request, or set both AgentOptions fields',
    )
  }

  const head = input.messages[0]?.role === 'system' ? input.messages.slice(0, 1) : []
  const body = input.messages.slice(head.length)
  const portions = summaryPortionCount(body, config.promptBudget)
  if (portions === 1) {
    return runSummaryAttempt(ctx, config, input, agent, target, input.messages, undefined, signal)
  }

  // Ordered portioning is what a conversation several times the window needs:
  // each call sees one slice plus the checkpoint the previous call produced, so
  // nothing is dropped and every slice is condensed at full fidelity. It is the
  // same shape as summarizing a summary, extended to N steps.
  const groups = splitReplay(body, portions)
  let carried: string | undefined
  let last: SummaryResult | undefined
  for (const [index, group] of groups.entries()) {
    last = await runSummaryAttempt(
      ctx,
      config,
      input,
      agent,
      target,
      [
        ...head,
        ...carried === undefined ? [] : [carryOverMessage(carried)],
        ...group,
      ],
      { index, total: groups.length },
      signal,
    )
    carried = last.summary
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n')
      .trim()
  }
  /* v8 ignore next -- portioning always yields at least one group. */
  if (last === undefined) throw new Error('summarization produced no portions')
  return last
}

/**
 * Run one summarization request, shrinking its own replay while the target keeps
 * refusing the prompt length.
 * @param ctx - context providing the LLM service.
 * @param config - resolved backend configuration.
 * @param input - replayed prefix, whose tool schemas the call reuses.
 * @param agent - supplies tool history and the session id.
 * @param target - provider and model to summarize with.
 * @param replay - messages this attempt sends.
 * @param portion - position of this attempt when the replay was divided.
 * @param signal - optional cancellation forwarded to the adapter.
 * @returns the checkpoint this attempt produced.
 */
async function runSummaryAttempt(
  ctx: Context,
  config: SummaryConfig,
  input: SummarizationInput,
  agent: Agent,
  target: { provider: string; model: string },
  replay: readonly Message[],
  portion: { index: number; total: number } | undefined,
  signal: AbortSignal | undefined,
): Promise<SummaryResult> {
  let messages: readonly Message[] = replay
  let maxTokens = config.maxTokens
  let refused: unknown
  for (let attempt = 0; attempt <= MAX_SUMMARY_SHRINK_ATTEMPTS; attempt += 1) {
    const instruction: RequestMessage = deepFreeze({
      role: 'user',
      content: [{ type: 'text', text: instructionText(portion, attempt > 0) }],
    })
    const options: GenerateOptions = {
      provider: target.provider,
      model: target.model,
      messages: [...messages, instruction],
      toolHistory: agent.session.toolHistory(),
      ...input.tools === undefined ? {} : { tools: [...input.tools] },
      maxTokens,
      sessionId: agent.session.id,
      purpose: 'compaction',
      ...signal === undefined ? {} : { signal },
    }
    const assembler = new BlockAssembler()
    try {
      for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
      const failure = finishError(assembler.finish)
      if (failure !== undefined) throw failure

      const rawOutput = assembler.blocks()
      const summary = summaryText(rawOutput)
      if (!summary.some(block => block.text.trim().length > 0)) {
        throw new Error('summarization produced no text summary content')
      }
      return {
        summary,
        rawOutput,
        llmStreamCall: true,
        provider: options.provider,
        model: options.model,
        maxTokens,
        ...(assembler.usage === undefined ? {} : { usage: assembler.usage }),
      }
    } catch (error: unknown) {
      // Only the target refusing this prompt's length is worth shrinking for.
      // Every other failure is the caller's to see unchanged.
      if (!isPromptTooLong(error)) throw error
      const shrink = shrinkReplay(messages, maxTokens)
      if (shrink === null) throw error
      refused = error
      messages = shrink.messages
      maxTokens = shrink.maxTokens
    }
  }
  /* v8 ignore next -- the final attempt shrinks or rethrows, so this only satisfies the compiler. */
  throw refused
}

/**
 * The directive for one attempt: the structured template, framed as one part of
 * an ordered run when the replay was divided, and told to record a gap when this
 * attempt already dropped turns.
 * @param portion - position among portions, absent for a whole-replay call.
 * @param trimmed - whether this attempt dropped turns from the replay.
 * @returns the directive text.
 */
function instructionText(portion: { index: number; total: number } | undefined, trimmed: boolean): string {
  const notice = trimmed ? TRIMMED_REPLAY_NOTICE : ''
  if (portion === undefined || portion.total <= 1) return COMPACTION_INSTRUCTION + notice
  const header = portion.index === 0
    ? `This replay is part 1 of ${portion.total} of ONE conversation, checkpointed in order. Summarize this part on its own; the next call merges your checkpoint into the following part.`
    : `This replay is part ${portion.index + 1} of ${portion.total} of ONE conversation, checkpointed in order. The carry-over checkpoint above condenses everything before it: keep its "Primary Request and Intent" and "Pending Jobs" entries unchanged, and add what this part contributes.`
  return `${header}\n\n${COMPACTION_INSTRUCTION}${notice}`
}

/**
 * Characters that occupy roughly one token each. Latin text averages several
 * characters per token, so a flat divisor prices a Chinese conversation at a
 * third of its real size — which is why an oversized replay was sent whole and
 * then trimmed instead of portioned.
 */
const WIDE_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uff60]/g

/**
 * Price one string in tokens.
 * @param text - the text to measure.
 * @returns the estimate for that string.
 */
function estimateTextTokens(text: string): number {
  const wide = text.match(WIDE_CHAR)?.length ?? 0
  return wide + Math.ceil((text.length - wide) / SUMMARY_CHARS_PER_TOKEN)
}

/**
 * Approximate the token count of a replay.
 * @param messages - messages to measure.
 * @returns the estimated token total.
 */
function estimateReplayTokens(messages: readonly Message[]): number {
  let total = 0
  for (const message of messages) {
    const content: unknown = message.content
    if (typeof content === 'string') {
      total += estimateTextTokens(content)
      continue
    }
    if (!Array.isArray(content)) continue
    for (const block of content as readonly ContentBlock[]) {
      if (block.type === 'text' || block.type === 'reasoning') total += estimateTextTokens(block.text)
      else total += Math.ceil(JSON.stringify(block).length / SUMMARY_CHARS_PER_TOKEN)
    }
  }
  return total
}

/**
 * How many ordered portions this replay needs to fit one prompt budget.
 * @param messages - the replayed conversation after its system head.
 * @param budget - prompt tokens one call may replay, when a window is known.
 * @returns 1 when it fits whole, otherwise the portion count.
 */
function summaryPortionCount(messages: readonly Message[], budget: number | undefined): number {
  if (budget === undefined || budget <= 0) return 1
  const estimated = Math.ceil(estimateReplayTokens(messages) / SUMMARY_CHARS_PER_TOKEN)
  if (estimated <= budget) return 1
  return Math.min(MAX_SUMMARY_PORTIONS, Math.ceil(estimated / budget))
}

/**
 * Divide a replay into contiguous, roughly equal portions in conversation order.
 * @param messages - the replayed conversation after its system head.
 * @param portions - how many groups to make.
 * @returns the groups, each non-empty, in order.
 */
function splitReplay(messages: readonly Message[], portions: number): Message[][] {
  const perGroup = Math.ceil(estimateReplayTokens(messages) / Math.max(1, portions))
  const groups: Message[][] = []
  let current: Message[] = []
  let size = 0
  for (const message of messages) {
    const cost = estimateReplayTokens([message])
    if (current.length > 0 && groups.length < portions - 1 && size + cost > perGroup) {
      groups.push(current)
      current = []
      size = 0
    }
    current.push(message)
    size += cost
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/**
 * A message that carries the previous portion's checkpoint into the next one.
 * @param checkpoint - the summary produced by the previous portion.
 * @returns the carry-over message.
 */
function carryOverMessage(checkpoint: string): Message {
  return deepFreeze({
    role: 'user',
    content: [{
      type: 'text',
      text: '## Carry-over checkpoint\n\nEverything before this point in the conversation is condensed into the checkpoint below. '
        + `The messages that follow are the next part of the same conversation.\n\n${checkpoint}`,
    }],
  }) as unknown as Message
}

/**
 * Whether one summarization attempt was refused because the prompt itself was
 * longer than the target's window. Adapters report the canonical code, and an
 * in-band finish carries the provider's own wording, so both are recognized.
 * @param error - the failure a summarization attempt raised.
 * @returns true when the target rejected the prompt length.
 */
function isPromptTooLong(error: unknown): boolean {
  if (error instanceof LlmError && error.code === CONTEXT_WINDOW_EXCEEDED_CODE) return true
  return isContextWindowExceededError(error instanceof Error ? error.message : String(error))
}

/**
 * Shrink one refused replay so the next attempt fits the same window.
 *
 * The replay mirrors the conversation, so the window that just refused it is the
 * one the conversation has to fit afterwards. A summarization request that can
 * never fit would make the Session uncompactable at that window, which is the
 * failure compaction exists to repair. Dropping the oldest turns keeps the
 * checkpoint centered on what is still active; the shadowed range is unchanged,
 * so the caller's shrink accounting stays exact.
 *
 * The prompt is what the target rejected, so the prompt is what shrinks first.
 * Output budget is only given back once nothing is left to drop, and never below
 * a usable checkpoint: a summary cut off at the cap is a failed compaction, not
 * a smaller one.
 *
 * A leading system message is never dropped: it carries the conversation's own
 * instructions, and every later turn reads against it.
 * @param messages - the replay the refused attempt sent.
 * @param maxTokens - the completion cap that attempt reserved.
 * @returns a smaller replay, or `null` when nothing more can be given back.
 */
function shrinkReplay(
  messages: readonly Message[],
  maxTokens: number,
): { messages: readonly Message[]; maxTokens: number } | null {
  const head = messages[0]?.role === 'system' ? messages.slice(0, 1) : []
  const rest = messages.slice(head.length)
  if (rest.length > 1) {
    const drop = Math.max(1, Math.ceil(rest.length / SUMMARY_TRIM_FRACTION))
    return { messages: [...head, ...rest.slice(drop)], maxTokens }
  }
  if (maxTokens > MIN_SUMMARY_MAX_TOKENS) {
    return { messages, maxTokens: Math.max(MIN_SUMMARY_MAX_TOKENS, Math.floor(maxTokens / 2)) }
  }
  return null
}

/**
 * Wrap raw summary blocks in the durable checkpoint framing.
 * @param summary - safe text-only model output.
 * @returns content for the synthesized replacement user message.
 */
export function frameSummary(summary: readonly ContentBlock[]): ContentBlock[] {
  return [
    { type: 'text', text: `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}` },
    ...summary,
    { type: 'text', text: SUMMARY_CLOSE_TAG },
  ]
}

/** Map a terminal summarization finish to its fail-closed error. */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'error':
    case 'aborted': {
      return new LlmError(finish.failure.message, finish.failure.code, finish.failure)
    }
    case 'max-tokens': {
      const error = new Error('summarization truncated at the token cap (incomplete checkpoint)') as Error & { code?: string }
      error.code = 'MAX_TOKENS'
      return error
    }
    default:
      return undefined
  }
}

/** Reject visual output and keep only text before synthesizing a user message. */
function summaryText(
  blocks: readonly ContentBlock[],
): Array<Extract<ContentBlock, { type: 'text' }>> {
  if (contentHasImage(blocks)) {
    throw new LlmError('compaction summary cannot contain image output', 'UNSUPPORTED_CONTENT')
  }
  return blocks.filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
}
