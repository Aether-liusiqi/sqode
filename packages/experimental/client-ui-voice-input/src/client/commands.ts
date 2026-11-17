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
  { aliases: ['退格', '删除最后一个字', 'backspace'], apply: draft => draft.slice(0, -1) },
  { aliases: ['删除整句', 'delete sentence'], apply: (draft) => {
    const kept = draft.match(/^[\s\S]*[。！？!?\n]/)
    return kept ? kept[0] : ''
  } },
  { aliases: ['删除全部', '清空', 'delete all', 'clear all'], apply: () => '' },
]

const TRAILING_PUNCTUATION = /[。！？!?，,、；;：:.]+$/

/**
 * Match a transcript against the command vocabulary.
 * Requires a full match after trimming and dropping trailing punctuation.
 * @param raw - transcript text from the recognizer.
 * @returns the command to execute, or `null` for ordinary text.
 */
export function matchVoiceCommand(raw: string): VoiceCommand | null {
  const normalized = raw.trim().replace(TRAILING_PUNCTUATION, '').toLowerCase()
  for (const rule of INSERT_RULES) {
    if (rule.aliases.some(alias => alias === normalized)) return { kind: 'insert', text: rule.text }
  }
  for (const rule of DELETE_RULES) {
    if (rule.aliases.some(alias => alias === normalized)) return { kind: 'delete', apply: rule.apply }
  }
  return null
}
