/** Exact-match voice commands, so ordinary dictation is never swallowed. */

/** A recognized command, or `null` when the transcript must be inserted verbatim. */
export type VoiceCommand =
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'delete'; readonly apply: (draft: string) => string }

interface InsertRule {
  readonly aliases: readonly string[]
  readonly text: string
}

interface DeleteRule {
  readonly aliases: readonly string[]
  readonly apply: (draft: string) => string
}

const INSERT_RULES: readonly InsertRule[] = [
  { aliases: ['空格', 'space'], text: ' ' },
  { aliases: ['回车', '换行', 'newline', 'enter'], text: '\n' },
  { aliases: ['句号', 'period', 'full stop'], text: '。' },
  { aliases: ['逗号', 'comma'], text: '，' },
  { aliases: ['冒号', 'colon'], text: '：' },
  { aliases: ['双引号', 'quote'], text: '"' },
  { aliases: ['问号', 'question mark'], text: '？' },
  { aliases: ['感叹号', 'exclamation mark'], text: '！' },
  { aliases: ['分号', 'semicolon'], text: '；' },
  { aliases: ['顿号'], text: '、' },
]

const DELETE_RULES: readonly DeleteRule[] = [
  { aliases: ['退格', '删除', '删除最后一个字', 'backspace', 'delete'], apply: draft => draft.slice(0, -1) },
  { aliases: ['删除整句', 'delete sentence'], apply: (draft) => {
    const kept = draft.match(/^[\s\S]*[。！？!?\n]/)
    return kept ? kept[0] : ''
  } },
  { aliases: ['删除全部', '清空', 'delete all', 'clear all'], apply: () => '' },
]

const TRAILING_PUNCTUATION = /[。！？!?，,、；;：:.]+$/
const LEAD_IN = /^(请你|请帮我|帮我一下|你帮我|帮我|麻烦|帮忙|请|please\s+)/i
const TRAILING_FILLER = /(一下|吧)$/

/**
 * Normalize a transcript for command matching: whitespace is collapsed, trailing
 * punctuation dropped, and one layer of polite lead-in or filler words removed.
 * Mid-sentence command words stay unmatched, so ordinary dictation is preserved.
 * @param raw - transcript text from the recognizer.
 * @returns normalized text.
 */
function normalize(raw: string): string {
  let text = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  for (let i = 0; i < 2; i++) {
    const stripped = text.replace(LEAD_IN, '').replace(TRAILING_FILLER, '').trim().replace(TRAILING_PUNCTUATION, '')
    if (stripped === text) break
    text = stripped
  }
  return text
}

/**
 * Match a transcript against the command vocabulary.
 * Requires a full match after normalization.
 * @param raw - transcript text from the recognizer.
 * @returns the command to execute, or `null` for ordinary text.
 */
export function matchVoiceCommand(raw: string): VoiceCommand | null {
  const normalized = normalize(raw)
  for (const rule of INSERT_RULES) {
    if (rule.aliases.some(alias => alias === normalized)) return { kind: 'insert', text: rule.text }
  }
  for (const rule of DELETE_RULES) {
    if (rule.aliases.some(alias => alias === normalized)) return { kind: 'delete', apply: rule.apply }
  }
  return null
}
