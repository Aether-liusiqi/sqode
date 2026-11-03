import { describe, expect, it } from 'vitest'

import {
  CORE_TOOLS, SHORT_DESCRIPTION_LIMIT, describeTool, selectTools,
} from '../src/tool-budget.ts'
import type { ToolSchema } from '../src/types.ts'

/** One tool, optionally carrying a schema large enough to matter. */
function tool(name: string, description = 'does something useful', padding = 0): ToolSchema {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: padding === 0 ? {} : { blob: { type: 'string', description: 'x'.repeat(padding) } },
    },
  }
}

const names = (tools: readonly ToolSchema[]): string[] => tools.map(tool => tool.name)

describe('tool declaration selection', () => {
  it('always declares the core tools, whatever the budget', () => {
    const selection = selectTools({
      catalog: [tool('read'), tool('pwsh')],
      contextWindow: 100,
      userText: '',
    })
    expect(names(selection.declared)).toEqual(['read', 'pwsh'])
    expect(selection.rejected).toEqual([])
  })

  it('declares what the session loaded, even when the message never names it', () => {
    const selection = selectTools({
      catalog: [tool('read'), tool('mcp__rea__trace_application_feature', 'trace one feature')],
      contextWindow: 100_000,
      userText: '继续',
      loaded: ['mcp__rea__trace_application_feature'],
    })
    expect(names(selection.declared)).toContain('mcp__rea__trace_application_feature')
    expect(selection.activated).toEqual([])
  })

  it('activates the tool the operator names, and says so', () => {
    const selection = selectTools({
      catalog: [tool('read'), tool('mcp__rea__trace_application_feature', 'trace one feature through the app')],
      contextWindow: 100_000,
      userText: '帮我 trace 一下这个 feature',
    })
    expect(names(selection.declared)).toContain('mcp__rea__trace_application_feature')
    expect(selection.activated).toEqual(['mcp__rea__trace_application_feature'])
  })

  it('leaves out everything the message does not name', () => {
    const selection = selectTools({
      catalog: [tool('read'), tool('mcp__rea__compare_web_captures', 'compare two web captures')],
      contextWindow: 100_000,
      userText: '继续',
    })
    expect(names(selection.declared)).toEqual(['read'])
  })

  it('reports a match it cannot afford instead of dropping it silently', () => {
    // A 1,000-token window allows 50 tokens of declaration; this schema cannot fit.
    const heavy = tool('mcp__rea__compare_web_captures', 'compare two web captures', 40_000)
    const selection = selectTools({
      catalog: [tool('read'), heavy],
      contextWindow: 1_000,
      userText: 'compare the web captures',
    })
    expect(names(selection.declared)).toEqual(['read'])
    expect(selection.rejected).toEqual(['mcp__rea__compare_web_captures'])
  })

  it('bounds the purpose shown in a catalogue listing', () => {
    const verbose = tool('mcp__rea__inspect_analysis_view', 'y'.repeat(500))
    expect(describeTool(verbose).length).toBeLessThanOrEqual(SHORT_DESCRIPTION_LIMIT)
    expect(describeTool(tool('read', 'read a file'))).toBe('read a file')
    expect(SHORT_DESCRIPTION_LIMIT).toBe(100)
  })

  it('keeps the catalogue helpers core, so a model can always reach the rest', () => {
    expect(CORE_TOOLS).toContain('list_tools')
    expect(CORE_TOOLS).toContain('load_tool')
  })
})
