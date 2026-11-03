/**
 * Decide which tools one request declares, and whether each travels in full.
 *
 * A catalog grows until it alone exceeds the window it is sent to: 240 tools
 * measured 821,567 characters here, and one of them was 155,695 by itself. Almost
 * none of that is the description a model reads to choose a tool — it is the
 * parameter schema. So a tool is declared in full only when the operator's own
 * words call for it, or when it belongs to the small core set; everything else is
 * dropped rather than declared in a form the model cannot afford to read.
 *
 * @module @liusiqi-dev/dsh-llm/tool-budget
 */

import type { ToolSchema } from './types.ts'

/** Longest purpose one lightweight declaration carries. */
export const SHORT_DESCRIPTION_LIMIT = 100

/** Share of the window the declared catalog may claim. */
export const TOOL_BUDGET_RATIO = 0.05

/** Approximate characters one token carries when pricing a catalog. */
const CHARS_PER_TOKEN = 4

/** Distinctive-word length below which a match is noise. */
const MIN_WORD_LENGTH = 4

/** Tools every request declares in full: small, and always plausible. */
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
]

/** What the decision depends on. */
export interface ToolSelectionOptions {
  /** The route's context window, which caps the declared volume. */
  readonly contextWindow: number
  /** The operator's latest message, matched against each tool's own wording. */
  readonly userText: string
}

/** One tool as the request will carry it. */
export interface DeclaredTool {
  /** Tool name, unchanged. */
  readonly name: string
  /** Whether the full schema travels with this request. */
  readonly full: boolean
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
 * Choose the declarations one request carries.
 *
 * Order of preference is core, then named by the message, then the rest as
 * lightweight entries until the budget is spent. Dropping is deliberate: a
 * declaration the model cannot afford to read crowds out the conversation.
 * @param tools - the full catalog available to this route.
 * @param options - the window and the operator's message.
 * @returns declarations in the order they should be offered.
 */
export function selectDeclaredTools(
  tools: readonly ToolSchema[],
  options: ToolSelectionOptions,
): DeclaredTool[] {
  const budget = Math.max(0, Math.floor(options.contextWindow * TOOL_BUDGET_RATIO))
  const text = options.userText.toLowerCase()
  const core = new Set(CORE_TOOLS)
  const declared: DeclaredTool[] = []
  let spent = 0

  const named = (tool: ToolSchema): boolean => !core.has(tool.name) && mentionsTool(tool, text)

  for (const tool of tools) {
    if (!core.has(tool.name)) continue
    spent += priceOf(tool)
    declared.push({ name: tool.name, full: true })
  }
  for (const tool of tools) {
    if (!named(tool)) continue
    const price = priceOf(tool)
    if (spent + price > budget) continue
    spent += price
    declared.push({ name: tool.name, full: true })
  }
  for (const tool of tools) {
    if (core.has(tool.name) || named(tool)) continue
    const stub = { name: tool.name, description: tool.description.slice(0, SHORT_DESCRIPTION_LIMIT) }
    const price = priceOf(stub)
    if (spent + price > budget) continue
    spent += price
    declared.push({ name: tool.name, full: false })
  }
  return declared
}
