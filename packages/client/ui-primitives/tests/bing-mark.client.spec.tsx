// @vitest-environment jsdom
/** The rounded-square master is the single source of truth for every brand mark. */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BRAND_MASTER_PATH } from '../src/brandMarkPath.ts'
import { BingMark } from '../src/BingMark.tsx'

describe('BingMark', () => {
  it('keeps the master path verbatim from the 1024 canvas', () => {
    expect(BRAND_MASTER_PATH.length).toBeGreaterThan(100)
    expect(BRAND_MASTER_PATH.startsWith('M')).toBe(true)
  })

  it('scales the 1024 master to the requested size', () => {
    const view = render(<BingMark size={34} />)
    const svg = view.container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 1024')
    expect(svg.getAttribute('width')).toBe('34')
    expect(svg.getAttribute('height')).toBe('34')
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses evenodd fill with a themeable CSS variable', () => {
    const view = render(<BingMark size={34} />)
    const g = view.container.querySelector('svg > g')!
    expect(g.getAttribute('fill-rule')).toBe('evenodd')
    expect(g.getAttribute('fill')).toContain('--sq-brand-mark-fill')
  })

  it('appends host-owned animation children inside the fill group', () => {
    const view = render(
      <BingMark size={34}>
        <animate attributeName="opacity" values="1;0.75;1" dur="1.6s" repeatCount="indefinite" />
      </BingMark>,
    )
    expect(view.container.querySelector('g > animate')).not.toBeNull()
  })
})
