/**
 * Default one-shot summarization and durable checkpoint framing.
 *
 * @module @liusiqi-dev/dsh-compaction-basic/summarizer
 */

import type { Context } from '@liusiqi-dev/cordis'
import {
  CONTEXT_WINDOW_EXCEEDED_CODE, BlockAssembler, LlmError, contentHasImage, isContextWindowExceededError,
} from '@liusiqi-dev/dsh-llm'
import { deepFreeze } from '@liusiqi-dev/dsh-util-values'
import type {
  ContentBlock, FinishReason, GenerateOptions, Message, RequestMessage, TokenUsage, ToolSchema,
} from '@liusiqi-dev/dsh-llm'
import type { Agent } from '@liusiqi-dev/dsh-agent'

interface SummaryConfig {
  readonly summarizationProvider: string
  readonly summarizationModel: string
  readonly maxTokens: number
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
  '- [exact path: why it matters, key changes or snippets]',
  '',
  '## Errors and Fixes',
  '- [error: how it was resolved, plus any related user feedback]',
  '',
  '## Pending Jobs',
  '- [explicitly requested work not yet completed]',
  '',
  '## Current Work',
  '- [precisely what was in progress at this checkpoint]',
  '',
  '## Next Step',
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  '',
  '## Critical Context',
  '- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]',
  '',
  'Rules:',
  '- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.',
  '- Capture user feedback and explicit instructions faithfully, especially corrections.',
  '- Do NOT mention this summarization request or that the context was compacted.',
  '- Output only the checkpoint text: do not call any tool or take any other action.',
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`,
].join('\n')

/**
 * Attempts one summarization spends shrinking its own replay after the target
 * refuses the prompt as too long. Each attempt is a provider round-trip that the
 * target rejects immediately, so this only bounds a recovery path that otherwise
 * fails the compaction outright.
 */
const MAX_SUMMARY_SHRINK_ATTEMPTS = 6

/** Floor for a shrunk completion cap: below this a checkpoint cannot be written. */
const MIN_SUMMARY_MAX_TOKENS = 1_024

/**
 * Fraction of the replayed turns dropped per shrink attempt once the completion
 * cap alone cannot make the request fit.
 */
const SUMMARY_TRIM_FRACTION = 4

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

  const instruction: RequestMessage = deepFreeze({
    role: 'user',
    content: [{ type: 'text', text: COMPACTION_INSTRUCTION }],
  })
  let replay: readonly Message[] = input.messages
  let maxTokens = config.maxTokens
  let refused: unknown
  for (let attempt = 0; attempt <= MAX_SUMMARY_SHRINK_ATTEMPTS; attempt += 1) {
    const options: GenerateOptions = {
      provider: target.provider,
      model: target.model,
      messages: [...replay, instruction],
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
      const shrink = shrinkReplay(replay, maxTokens)
      if (shrink === null) throw error
      refused = error
      replay = shrink.messages
      maxTokens = shrink.maxTokens
    }
  }
  /* v8 ignore next -- the final attempt shrinks or rethrows, so this only satisfies the compiler. */
  throw refused
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
 * Shrink one refused replay so the next attempt can fit the same window: first
 * give back completion budget, then drop the oldest replayed turns.
 *
 * The replay mirrors the conversation, so the window that just refused it is the
 * one the conversation has to fit afterwards. A summarization request that can
 * never fit would make the Session uncompactable at that window, which is the
 * failure compaction exists to repair. Dropping the oldest turns keeps the
 * checkpoint centered on what is still active; the shadowed range is unchanged,
 * so the caller's shrink accounting stays exact.
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
  if (maxTokens > MIN_SUMMARY_MAX_TOKENS) {
    return { messages, maxTokens: Math.max(MIN_SUMMARY_MAX_TOKENS, Math.floor(maxTokens / 4)) }
  }
  const head = messages[0]?.role === 'system' ? messages.slice(0, 1) : []
  const rest = messages.slice(head.length)
  if (rest.length <= 1) return null
  const drop = Math.max(1, Math.ceil(rest.length / SUMMARY_TRIM_FRACTION))
  return { messages: [...head, ...rest.slice(drop)], maxTokens }
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
