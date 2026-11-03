/**
 * The wrap-up notice shown before pressure compaction fires.
 *
 * A fixed sentence stops being read by the third time it appears. The notice is
 * therefore generated from facts the engine already knows — how full the window
 * is, how much runway is left, whether a tool loop is open, and what remains to
 * be done — so it can name the remaining work instead of repeating "context is
 * nearly full".
 *
 * @module @liusiqi-dev/dsh-compaction-basic/notice
 */

import { noticeThresholdTokens } from './config.ts'

declare module '@liusiqi-dev/dsh-llm' {
  // Registered here because this module owns the kind, the same way the base
  // compaction package registers its checkpoint source.
  interface MessageSourceMap {
    'compaction-notice': { readonly kind: 'compaction-notice' }
  }
}

/** What the engine knows when the warning point is crossed. */
export interface NoticeFacts {
  /** Estimated prompt tokens now. */
  readonly usedTokens: number
  /** The route's context window. */
  readonly contextWindow: number
  /** The threshold pressure compaction fires at. */
  readonly thresholdTokens: number
  /** Whether a tool call is still in flight this step. */
  readonly inToolLoop: boolean
  /** Compactions already run in this Turn. */
  readonly compactionsThisTurn: number
  /** The most recent thing the operator asked for, quoted. */
  readonly lastRequest: string
  /** Work declared but not finished, newest last. */
  readonly pendingWork: readonly string[]
}

/** State the engine checks before it shows a notice. */
export interface NoticeGate {
  /** Estimated prompt tokens now. */
  readonly usedTokens: number
  /** The threshold pressure compaction fires at. */
  readonly thresholdTokens: number
  /** Whether this Turn already carried a notice. */
  readonly alreadyNoticed: boolean
  /** Whether a compaction is running or about to run right now. */
  readonly compacting: boolean
}

/**
 * Whether this step should show the wrap-up notice.
 *
 * Three rules, each learned from a way this can go wrong: never twice in one
 * Turn, never while a compaction is already handling the same pressure, and
 * never before the runway is short enough to act on.
 * @param gate - the state the decision depends on.
 * @returns true when the notice belongs in this step.
 */
export function dueForNotice(gate: NoticeGate): boolean {
  if (gate.alreadyNoticed || gate.compacting) return false
  return gate.usedTokens >= noticeThresholdTokens(gate.thresholdTokens)
}

/** How much runway is left before compaction, in tokens. */
export function remainingRunway(facts: NoticeFacts): number {
  return Math.max(0, facts.thresholdTokens - facts.usedTokens)
}

/**
 * The directive handed to the summarizer that writes the notice.
 *
 * Kept short on purpose: this request runs at the moment the context is fullest,
 * so it carries facts, not the conversation.
 * @param facts - the state the notice must describe.
 * @returns the directive text.
 */
export function noticeDirective(facts: NoticeFacts): string {
  const percent = Math.round((facts.usedTokens / Math.max(1, facts.contextWindow)) * 100)
  const pending = facts.pendingWork.length === 0
    ? '(none recorded)'
    : facts.pendingWork.map(item => `- ${item}`).join('\n')
  return [
    'Write the one notice a coding assistant shows its operator when the context window is nearly full.',
    '',
    `Facts: ${facts.usedTokens} of ${facts.contextWindow} tokens used (${percent}%); `
    + `compaction fires at ${facts.thresholdTokens}, leaving about ${remainingRunway(facts)} tokens `
    + `(roughly ${Math.max(1, Math.round(remainingRunway(facts) / 4_000))} steps).`,
    `Tool call in flight: ${facts.inToolLoop ? 'yes' : 'no'}. `
    + `Compactions already run this turn: ${facts.compactionsThisTurn}.`,
    `Operator's latest request: "${facts.lastRequest}"`,
    '',
    'Unfinished work going into the next round:',
    pending,
    '',
    'Rules: at most two sentences; name how many steps remain and one concrete action '
    + '(finish the current step, save the conclusion, or carry the unfinished work into a new session); '
    + 'mention the unfinished items so nothing is silently dropped; no greeting, no apology, '
    + 'no repetition of an earlier notice; do not invent work the operator never asked for.',
  ].join('\n')
}

/**
 * Ask the generator for a notice, falling back when it cannot deliver one.
 *
 * The generation is injected rather than performed here: it is one model call
 * made at the moment the context is fullest, and keeping it outside this module
 * is what lets the failure path be tested without a provider.
 * @param facts - the state the notice must describe.
 * @param generate - runs the directive and returns the notice text, if it produced one.
 * @returns the generated notice, or the plain fallback that carries the same facts.
 */
export async function composeNotice(
  facts: NoticeFacts,
  generate: (directive: string) => Promise<string | undefined>,
): Promise<string> {
  try {
    const generated = (await generate(noticeDirective(facts)))?.trim()
    if (generated !== undefined && generated.length > 0) return generated
  } catch {
    // A notice that cannot be generated must still be a notice.
  }
  return fallbackNotice(facts)
}

/**
 * The most recent thing the operator typed, for the notice to quote.
 *
 * Only a user-role message counts: synthetic context and tool results also reach
 * the surface, and quoting one of those back would read as if the operator had
 * said it.
 * @param messages - the session's derived model-visible history.
 * @returns the latest user text, or an empty string when none was found.
 */
export function latestUserRequest(messages: readonly { role: string; content: unknown }[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'user') continue
    const content = message.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((block): block is { type: string; text: string } => {
        const candidate = block as { type?: unknown; text?: unknown }
        return candidate.type === 'text' && typeof candidate.text === 'string'
      })
      .map(block => block.text)
      .join(' ')
      .trim()
    if (text.length > 0) return text
  }
  return ''
}

/**
 * The synthetic user-role message that carries a notice.
 *
 * `source.kind` is what lets the transcript tell this apart from something the
 * operator typed; the channel itself is the one this build already uses for
 * model-visible context nobody typed.
 * @param text - the notice to deliver.
 * @returns a user-role message ready for injection.
 */
export function noticeUserMessage(text: string): {
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: 'compaction-notice' }
} {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'compaction-notice' },
  }
}

/**
 * The notice used when generation fails or is unavailable.
 *
 * It carries the same facts in plainer words, so a failed generation never turns
 * into silence.
 * @param facts - the state the notice must describe.
 * @returns a one-line fallback notice.
 */
export function fallbackNotice(facts: NoticeFacts): string {
  const percent = Math.round((facts.usedTokens / Math.max(1, facts.contextWindow)) * 100)
  const steps = Math.max(1, Math.round(remainingRunway(facts) / 4_000))
  const pending = facts.pendingWork.length === 0
    ? ''
    : ` 未完成：${facts.pendingWork.join('、')}。`
  return `上下文已用 ${percent}%，大约还能走 ${steps} 步；建议先收束这一步再开新任务。${pending}`.trim()
}
