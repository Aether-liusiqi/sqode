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
