import { describe, expect, it } from 'vitest'

import { loadedToolOrder, loadedTools } from '../src/loaded.ts'

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

  it('keeps the load order, oldest first', () => {
    const order = loadedToolOrder([
      { type: 'tools/loaded', data: { toolName: 'alpha' } },
      { type: 'tools/loaded', data: { toolName: 'beta' } },
    ])
    expect(order).toEqual(['alpha', 'beta'])
  })

  it('promotes a name that is loaded again, so a squeezed-out tool can return', () => {
    const order = loadedToolOrder([
      { type: 'tools/loaded', data: { toolName: 'alpha' } },
      { type: 'tools/loaded', data: { toolName: 'beta' } },
      // The model asks for `alpha` again: it must move to the end, because the
      // declaration budget keeps the most recent loads.
      { type: 'tools/loaded', data: { toolName: 'alpha' } },
    ])
    expect(order).toEqual(['beta', 'alpha'])
    // Membership is unchanged; only the order moved.
    expect(loadedTools([
      { type: 'tools/loaded', data: { toolName: 'alpha' } },
      { type: 'tools/loaded', data: { toolName: 'beta' } },
      { type: 'tools/loaded', data: { toolName: 'alpha' } },
    ]).size).toBe(2)
  })
})
