import { describe, expect, it } from 'vitest'

import {
  CORE_TOOLS, SHORT_DESCRIPTION_LIMIT, selectDeclaredTools,
} from '../src/tool-budget.ts'
import type { ToolSchema } from '../src/types.ts'

/** One tool with a schema large enough to matter. */
function tool(name: string, description = 'does something useful', padding = 0): ToolSchema {
  return {
    name,
    description,
    parameters: { type: 'object', properties: padding === 0 ? {} : { blob: { type: 'string', description: 'x'.repeat(padding) } } },
  }
}

describe('tool declaration budget', () => {
  it('always declares the core tools in full', () => {
    const declared = selectDeclaredTools([tool('read'), tool('pwsh')], { contextWindow: 1_000, userText: '' })
    expect(declared).toEqual([
      { name: 'read', full: true },
      { name: 'pwsh', full: true },
    ])
    expect(CORE_TOOLS).toContain('read')
  })

  it('upgrades a tool the operator names', () => {
    const catalog = [tool('read'), tool('mcp__rea__trace_application_feature', 'trace one feature through the app')]
    const declared = selectDeclaredTools(catalog, {
      contextWindow: 100_000,
      userText: '帮我 trace 一下这个 feature',
    })
    expect(declared).toContainEqual({ name: 'mcp__rea__trace_application_feature', full: true })
  })

  it('keeps unnamed tools lightweight instead of dropping them', () => {
    const catalog = [tool('read'), tool('mcp__rea__compare_web_captures', 'compare two web captures')]
    const declared = selectDeclaredTools(catalog, { contextWindow: 100_000, userText: '继续' })
    expect(declared).toContainEqual({ name: 'mcp__rea__compare_web_captures', full: false })
  })

  it('stops declaring once the window share is spent', () => {
    // 1,000 tokens of window means a 50-token budget; a 40 KB schema cannot fit.
    const heavy = tool('mcp__rea__compare_web_captures', 'compare two web captures', 40_000)
    const declared = selectDeclaredTools([tool('read'), heavy], {
      contextWindow: 1_000,
      userText: 'compare the web captures',
    })
    expect(declared).toEqual([{ name: 'read', full: true }])
  })

  it('bounds the purpose carried by a lightweight declaration', () => {
    const verbose = tool('mcp__rea__inspect_analysis_view', 'y'.repeat(500))
    const declared = selectDeclaredTools([verbose], { contextWindow: 100_000, userText: '继续' })
    expect(declared[0]?.full).toBe(false)
    expect(SHORT_DESCRIPTION_LIMIT).toBe(100)
  })
})
