import { describe, expect, it } from 'vitest'
import { buildMultiTimeCron } from '../src/client/schedule-create-selector.ts'

describe('buildMultiTimeCron', () => {
  it('builds a daily multi-hour cron with one shared minute', () => {
    expect(buildMultiTimeCron([8, 13, 18], 30, [])).toBe('30 8,13,18 * * *')
  })

  it('sorts hours regardless of selection order', () => {
    expect(buildMultiTimeCron([18, 8, 13], 30, [])).toBe('30 8,13,18 * * *')
  })

  it('maps ISO weekdays to cron day numbers, with Sunday as zero', () => {
    expect(buildMultiTimeCron([8, 18], 30, [7, 1])).toBe('30 8,18 * * 0,1')
  })

  it('handles a single hour and a zero minute', () => {
    expect(buildMultiTimeCron([9], 0, [])).toBe('0 9 * * *')
  })
})
