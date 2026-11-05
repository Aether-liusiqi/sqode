import { describe, expect, it } from 'vitest'

import { loadedToolName, promoteLoadedTool } from '../src/loaded.ts'

describe('load order step', () => {
  it('appends a first load', () => {
    expect(promoteLoadedTool([], 'alpha')).toEqual(['alpha'])
    expect(promoteLoadedTool(['alpha'], 'beta')).toEqual(['alpha', 'beta'])
  })

  it('moves a repeat load to the end, which is how a squeezed-out tool returns', () => {
    // The declaration budget keeps the most recent names, so promotion is the
    // whole mechanism behind "ask for it again and it comes back".
    expect(promoteLoadedTool(['alpha', 'beta'], 'alpha')).toEqual(['beta', 'alpha'])
    expect(promoteLoadedTool(['alpha', 'beta', 'gamma'], 'beta')).toEqual(['alpha', 'gamma', 'beta'])
  })

  it('never stores a name twice', () => {
    const order = promoteLoadedTool(promoteLoadedTool(['alpha'], 'alpha'), 'alpha')
    expect(order).toEqual(['alpha'])
  })
})

describe('load event payload', () => {
  it('reads the tool name from a load event', () => {
    expect(loadedToolName({ type: 'tools/loaded', data: { toolName: 'read' } })).toBe('read')
  })

  it('ignores other events and malformed payloads', () => {
    expect(loadedToolName({ type: 'turn/start', data: { toolName: 'read' } })).toBeUndefined()
    expect(loadedToolName({ type: 'tools/loaded' })).toBeUndefined()
    expect(loadedToolName({ type: 'tools/loaded', data: null })).toBeUndefined()
    expect(loadedToolName({ type: 'tools/loaded', data: { toolName: 42 } })).toBeUndefined()
    expect(loadedToolName({ type: 'tools/loaded', data: { toolName: '' } })).toBeUndefined()
  })
})
