/**
 * Choose the tools one request declares, and say what it left out.
 *
 * A catalog grows until it alone exceeds the window it is sent to: 240 tools
 * measured 821,567 characters here, and one of them was 155,695 by itself. Nearly
 * all of that is parameter schema, not the sentence a model reads to choose a
 * tool. So a request declares the small core set, whatever the session has
 * explicitly loaded, and whatever the operator's own message names — and nothing
 * else. A tool omitted here is not gone: the catalogue can list it, and the model
 * can load it by name for the next request.
 *
 * @module @liusiqi-dev/dsh-llm/tool-budget
 */

import type { ToolSchema } from './types.ts'

/** Longest purpose one catalogue entry carries. */
export const SHORT_DESCRIPTION_LIMIT = 100

/** Share of the window the declared catalog may claim. */
export const TOOL_BUDGET_RATIO = 0.05

/** Approximate characters one token carries when pricing a catalog. */
const CHARS_PER_TOKEN = 4

/** Distinctive-word length below which a match is noise. */
const MIN_WORD_LENGTH = 4

/**
 * Tools every request declares: small, and plausible in any conversation.
 *
 * `list_tools` and `load_tool` are core on purpose — they are how a model reaches
 * everything this list does not contain.
 */
export const CORE_TOOLS: readonly string[] = [
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'pwsh',
  'bash',
  'ask_user_question',
  'job_list',
  'job_output',
  'job_stop',
  'list_tools',
  'load_tool',
]

/** What the decision depends on. */
export interface ToolSelectionInput {
  /** Every tool the route could offer. */
  readonly catalog: readonly ToolSchema[]
  /** The route's context window, which caps the declared volume. */
  readonly contextWindow: number
  /** The operator's latest message, matched against each tool's wording. */
  readonly userText: string
  /** Tools this session has explicitly loaded, by name. */
  readonly loaded?: readonly string[]
}

/** What one request will carry, and what it had to leave out. */
export interface ToolSelection {
  /** Tools to send, in catalog order. */
  readonly declared: readonly ToolSchema[]
  /** Names the operator's message activated; the session records these as loaded. */
  readonly activated: readonly string[]
  /** Names dropped because the budget was already spent. */
  readonly rejected: readonly string[]
}

/**
 * Price any value the way the budget counts it.
 * @param value - JSON-serializable value.
 * @returns estimated tokens.
 */
function priceOf(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN)
}

/**
 * Whether the operator's message names this tool's subject.
 *
 * Literal on purpose: a semantic match would need a model call at the moment the
 * context is fullest, which is the wrong trade for choosing a tool.
 * @param tool - the candidate tool.
 * @param text - the operator's message, lowercased.
 * @returns true when a distinctive word of the tool appears in the message.
 */
export function mentionsTool(tool: ToolSchema, text: string): boolean {
  const words = `${tool.name} ${tool.description}`
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(word => word.length >= MIN_WORD_LENGTH)
  return words.some(word => text.includes(word))
}

/**
 * The one-line purpose a catalogue or a lightweight listing shows.
 * @param tool - the tool to describe.
 * @returns its description, cut to the catalogue limit.
 */
export function describeTool(tool: ToolSchema): string {
  const text = tool.description.trim()
  return text.length <= SHORT_DESCRIPTION_LIMIT ? text : `${text.slice(0, SHORT_DESCRIPTION_LIMIT - 1)}…`
}

/**
 * Choose the declarations one request carries.
 *
 * Core and explicitly loaded tools are not negotiable; keyword matches fill
 * whatever the window's share leaves. A match that does not fit is reported rather
 * than silently dropped, because that usually means the keyword table or the
 * budget needs attention.
 * @param input - catalog, window, message, and what the session already loaded.
 * @returns the declarations, the names to record as loaded, and the rejected ones.
 */
export function selectTools(input: ToolSelectionInput): ToolSelection {
  const budget = Math.max(0, Math.floor(input.contextWindow * TOOL_BUDGET_RATIO))
  const text = input.userText.toLowerCase()
  const core = new Set(CORE_TOOLS)
  const loaded = new Set(input.loaded ?? [])

  const declared: ToolSchema[] = []
  const activated: string[] = []
  const rejected: string[] = []
  let spent = 0

  const mandatory = new Set<string>()
  for (const tool of input.catalog) {
    if (core.has(tool.name) || loaded.has(tool.name)) mandatory.add(tool.name)
  }

  for (const tool of input.catalog) {
    if (!mandatory.has(tool.name)) continue
    spent += priceOf(tool)
    declared.push(tool)
  }

  for (const tool of input.catalog) {
    if (mandatory.has(tool.name)) continue
    if (!mentionsTool(tool, text)) continue
    activated.push(tool.name)
    const price = priceOf(tool)
    if (spent + price > budget) {
      rejected.push(tool.name)
      continue
    }
    spent += price
    declared.push(tool)
  }

  return { declared, activated, rejected }
}
