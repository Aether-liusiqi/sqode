/**
 * Model-facing, workspace-authorized session-history search and read tools.
 *
 * @module @liusiqi-dev/dsh-tool-session-query
 */

import type { Context } from '@liusiqi-dev/cordis'
import z from '@liusiqi-dev/schemastery'
import { MAX_TIMER_DELAY_MS } from '@liusiqi-dev/dsh-timeout'
import { defineTool, loadedTools } from '@liusiqi-dev/dsh-tools'
import { toolInput } from './input.ts'
import { operations } from './operations.ts'
import { presentation } from './presentation.ts'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'tool-session-query'

/** Capability services required by the model-facing consumer. */
export const inject = ['tools', 'systemPrompt', 'sessionQuery', 'sessionProjections']

/** Default maximum number of authorized search hits returned by one call. */
export const DEFAULT_MAX_SEARCH_RESULTS = 100

/** Default cooperative deadline for either full-text search tool. */
export const DEFAULT_SEARCH_TIMEOUT_MS = 30_000

/** Deployment-owned search count and timeout bounds. */
export interface Config {
  /** Maximum authorized hits returned by one search call. Defaults to 100. */
  maxSearchResults?: number
  /** Cooperative full-text search deadline in milliseconds. Defaults to 30000. */
  searchTimeoutMs?: number
}

/** Schemastery config for Loader defaults and generated configuration docs. */
export const Config: z<Config> = z.object({
  maxSearchResults: z.number().step(1).min(1).default(DEFAULT_MAX_SEARCH_RESULTS),
  searchTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_SEARCH_TIMEOUT_MS),
})

interface ResolvedConfig {
  readonly maxSearchResults: number
  readonly searchTimeoutMs: number
}

/** Tools one search returns; a model that needs more asks again. */
const SEARCH_RESULT_LIMIT = 8

/** Tool names a `select:` query asks for. */
function selectedNames(query: string): string[] | undefined {
  if (!query.toLowerCase().startsWith('select:')) return undefined
  return query.slice('select:'.length).split(',').map(name => name.trim()).filter(name => name.length > 0)
}

/**
 * Whether a tool's own wording answers the query.
 * @param tool - the candidate tool.
 * @param query - the lowercased query.
 * @returns true when the name or the description contains a query word.
 */
function answers(tool: { name: string; description: string }, query: string): boolean {
  const haystack = `${tool.name} ${tool.description}`.toLowerCase()
  return query.split(/\s+/).filter(word => word.length >= 2).some(word => haystack.includes(word))
}

/**
 * Find tools and record the matches as loaded.
 *
 * One call loads as many tools as it matches: each separate search costs a round
 * trip, so the tool is built to be asked once with everything the model expects to
 * need.
 * @param ctx - the plugin context, for the tool registry.
 * @param query - a purpose, or `select:name,name` for exact names.
 * @param exec - the execution context carrying the calling agent.
 * @returns the message the model reads.
 */
function searchTools(
  ctx: Context,
  query: string,
  exec: { readonly agent?: { readonly session: {
    snapshotEvents(): readonly { type: string; data?: unknown }[]
    append(type: 'tools/loaded', data: { toolName: string }, opts: { ignorable: true }): unknown
  } } },
): string {
  const agent = exec.agent
  if (agent === undefined) throw new Error('tool_search needs an Agent-backed session')
  const session = agent.session
  const catalog = ctx.tools.schemas()
  const names = selectedNames(query)
  const matched = names === undefined
    ? catalog.filter(tool => answers(tool, query.trim().toLowerCase())).slice(0, SEARCH_RESULT_LIMIT)
    : names.map(name => catalog.find(tool => tool.name === name)).filter((tool): tool is NonNullable<typeof tool> => tool !== undefined)
  if (matched.length === 0) {
    return `No tool matched "${query}". Call list_tools to browse the catalog.`
  }
  const already = loadedTools(session.snapshotEvents())
  const added: string[] = []
  for (const tool of matched) {
    if (already.has(tool.name)) continue
    // Ignorable: an older reader skips this event rather than refusing the log, and
    // worst case it declares the tool twice in a later request.
    session.append('tools/loaded', { toolName: tool.name }, { ignorable: true })
    added.push(tool.name)
  }
  const lines = matched.map(tool => `- ${tool.name}: ${tool.description.trim().slice(0, 120)}`)
  const status = added.length === 0
    ? 'All of these were already loaded.'
    : `Loaded ${String(added.length)}: ${added.join(', ')}. They are declared from the next request on.`
  return `${status}\n${lines.join('\n')}`
}

/** Longest purpose one catalogue line carries. */
const LISTING_PURPOSE_LIMIT = 100

/**
 * Render the catalog as one line per tool.
 * @param tools - the schemas this session can reach.
 * @returns the listing the model reads.
 */
function describeTools(tools: readonly { name: string; description: string }[]): string {
  const lines = tools.map((tool) => {
    const text = tool.description.trim()
    const purpose = text.length <= LISTING_PURPOSE_LIMIT ? text : `${text.slice(0, LISTING_PURPOSE_LIMIT - 1)}…`
    return `${tool.name} — ${purpose}`
  })
  return `${String(tools.length)} tools\n\n${lines.join('\n')}`
}

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const PROMPT_TEXT =
  'Use session_search to find relevant work from prior sessions, or session_event_search to search earlier '
  + 'events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with '
  + 'session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.'

/** Register all five tools and their shared model guidance. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.systemPrompt.section({
    name: 'tool:session-query',
    order: ctx.systemPrompt.getSectionOrder('TOOL_SESSION_QUERY'),
    text: PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'list_tools',
    description: 'List every tool this session can use, one line each, including tools the current request did not declare.',
    parameters: {},
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    // Deliberately unbudgeted: a narrow window declares a small set, and a listing
    // that hid the rest would tell the model those tools do not exist.
    execute: () => Promise.resolve(describeTools(ctx.tools.schemas())),
  }))

  ctx.tools.register(defineTool({
    name: 'tool_search',
    description: 'Find tools by name or purpose and load them for the next request. Use "select:name,name" for exact names; one call can load several.',
    parameters: {
      query: { type: 'string', required: true, description: 'A purpose in words, or select:name,name for exact tools.' },
    },
    output: TEXT_OUTPUT,
    execute: (args, exec) => Promise.resolve(searchTools(ctx, args.query, exec)),
  }))

  ctx.tools.register(defineTool({
    name: 'session_search',
    description: 'Search prior sessions in the caller workspace and return the strongest matching event from each session.',
    parameters: toolInput.sessionSearchParameters,
    output: TEXT_OUTPUT,
    timeoutMs: resolved.searchTimeoutMs,
    execute: (args, exec) => operations.executeSessionSearch(ctx, args, exec, resolved.maxSearchResults),
    presentCall: presentation.presentSessionSearchCall,
  }))

  ctx.tools.register(defineTool({
    name: 'session_event_search',
    description: 'Search prior events in one authorized session; the current session excludes the step performing this call.',
    parameters: toolInput.eventSearchParameters,
    output: TEXT_OUTPUT,
    timeoutMs: resolved.searchTimeoutMs,
    execute: (args, exec) => operations.executeEventSearch(ctx, args, exec, resolved.maxSearchResults),
    presentCall: presentation.presentEventSearchCall,
  }))

  ctx.tools.register(defineTool({
    name: 'session_trace',
    description: 'Read the authorized session lineage around one session, including complete visible ancestor and descendant relationships.',
    parameters: toolInput.targetSessionParameter,
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: (args, exec) => operations.executeSessionTrace(ctx, args, exec),
    presentCall: presentation.presentSessionTraceCall,
  }))

  ctx.tools.register(defineTool({
    name: 'session_event_trace',
    description: 'Read every direct replacement and relationship to a cited source event for one event in an authorized session.',
    parameters: {
      ...toolInput.targetSessionParameter,
      seq: { type: 'integer', required: true, description: 'Target event sequence number.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: (args, exec) => operations.executeEventTrace(ctx, args, exec),
    presentCall: args => presentation.presentEventTargetCall('Trace event', args),
  }))

  ctx.tools.register(defineTool({
    name: 'session_event_read',
    description: 'Read one full unabridged event and optional neighboring raw-event summaries from an authorized session.',
    parameters: {
      ...toolInput.targetSessionParameter,
      seq: { type: 'integer', required: true, description: 'Target event sequence number.' },
      before: { type: 'integer', description: 'Number of preceding raw events to summarize. Omit for none.' },
      after: { type: 'integer', description: 'Number of following raw events to summarize. Omit for none.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: (args, exec) => operations.executeEventRead(ctx, args, exec),
    presentCall: args => presentation.presentEventTargetCall('Read event', args),
  }))
}

function resolveConfig(config: Config): ResolvedConfig {
  const maxSearchResults = config.maxSearchResults ?? DEFAULT_MAX_SEARCH_RESULTS
  const searchTimeoutMs = config.searchTimeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS
  if (!Number.isSafeInteger(maxSearchResults) || maxSearchResults < 1) {
    throw new TypeError('tool-session-query: maxSearchResults must be a positive safe integer')
  }
  if (!Number.isInteger(searchTimeoutMs) || searchTimeoutMs < 1 || searchTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new TypeError(
      `tool-session-query: searchTimeoutMs must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return { maxSearchResults, searchTimeoutMs }
}
