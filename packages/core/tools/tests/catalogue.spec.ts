import { describe, expect, it } from 'vitest'

import { CATALOGUE_PURPOSE_LIMIT, createCatalogue } from '../src/catalogue.ts'
import type { ToolSchema } from '@liusiqi-dev/dsh-llm'

/** One tool with the shape the registry hands over. */
function tool(name: string, description = 'does something useful'): ToolSchema {
  return { name, description, parameters: { type: 'object', properties: {} } }
}

describe('tool catalogue', () => {
  it('lists what the registry currently holds', () => {
    const catalogue = createCatalogue(() => [tool('read'), tool('pwsh')])
    expect(catalogue.list().map(entry => entry.name)).toEqual(['read', 'pwsh'])
  })

  it('reads the registry on every call, so a withdrawn tool disappears', () => {
    let held: ToolSchema[] = [tool('read'), tool('gone')]
    const catalogue = createCatalogue(() => held)
    expect(catalogue.describe()).toHaveLength(2)
    held = [tool('read')]
    expect(catalogue.describe()).toHaveLength(1)
    expect(catalogue.resolve('gone')).toBeUndefined()
  })

  it('resolves a full schema by name', () => {
    const catalogue = createCatalogue(() => [tool('read', 'read a file')])
    expect(catalogue.resolve('read')?.description).toBe('read a file')
  })

  it('keeps every purpose to one bounded line', () => {
    const verbose = tool('mcp__rea__inspect_analysis_view', 'y'.repeat(500))
    const [entry] = createCatalogue(() => [verbose]).describe()
    expect(entry?.purpose.length).toBeLessThanOrEqual(CATALOGUE_PURPOSE_LIMIT)
    expect(entry?.purpose.endsWith('…')).toBe(true)
  })
})
