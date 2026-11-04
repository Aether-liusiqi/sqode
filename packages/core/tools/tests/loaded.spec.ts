import { describe, expect, it } from 'vitest'

import { loadedTools } from '../src/loaded.ts'

describe('loaded tools', () => {
  it('collects every tool the session loaded', () => {
    const loaded = loadedTools([
      { type: 'turn/start', data: {} },
      { type: 'tools/loaded', data: { toolName: 'mcp__rea__trace_application_feature' } },
      { type: 'tools/loaded', data: { toolName: 'mcp__rea__inspect_analysis_view' } },
    ])
    expect([...loaded]).toEqual(['mcp__rea__trace_application_feature', 'mcp__rea__inspect_analysis_view'])
  })

  it('ignores other events and malformed payloads', () => {
    const loaded = loadedTools([
      { type: 'tools/loaded' },
      { type: 'tools/loaded', data: null },
      { type: 'tools/loaded', data: { toolName: 42 } },
      { type: 'tools/loaded', data: { toolName: '' } },
      { type: 'assistant/message', data: { toolName: 'not-a-load' } },
    ])
    expect(loaded.size).toBe(0)
  })

  it('stays monotonic: a later turn without the name does not unload it', () => {
    const loaded = loadedTools([
      { type: 'tools/loaded', data: { toolName: 'read' } },
      { type: 'turn/end', data: {} },
      { type: 'turn/start', data: {} },
    ])
    expect(loaded.has('read')).toBe(true)
  })
})
