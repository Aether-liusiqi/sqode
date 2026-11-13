// @vitest-environment jsdom
/** The rounded-square master is the single source of truth for every brand mark. */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BRAND_BG_PATH, BRAND_CARETS_PATH } from '../src/brandMarkPath.ts'
import { BingMark } from '../src/BingMark.tsx'

describe('BingMark', () => {
  it('keeps both master paths (orange bg + white carets) verbatim from icon.svg', () => {
    expect(BRAND_BG_PATH.length).toBeGreaterThan(4000)
    expect(BRAND_BG_PATH.startsWith('M')).toBe(true)
    expect(BRAND_CARETS_PATH.length).toBeGreaterThan(1000)
    expect(BRAND_CARETS_PATH.startsWith('M')).toBe(true)
  })

  it('scales the 1024 master to the requested size', () => {
    const view = render(<BingMark size={34} />)
    const svg = view.container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 1024')
    expect(svg.getAttribute('width')).toBe('34')
    expect(svg.getAttribute('height')).toBe('34')
    // Two paths: orange bg (evenodd) + white carets
    expect(svg.querySelectorAll('path')).toHaveLength(2)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses themeable CSS variables for both fill layers', () => {
    const view = render(<BingMark size={34} />)
    const paths = view.container.querySelectorAll('path')!
    expect(paths[0].getAttribute('fill')).toContain('--sq-brand-mark-fill')
    expect(paths[0].getAttribute('fill-rule')).toBe('evenodd')
    expect(paths[1].getAttribute('fill')).toContain('--sq-brand-carets-fill')
  })

  it('appends host-owned animation children inside the svg', () => {
    const view = render(
      <BingMark size={34}>
        <animate attributeName="opacity" values="1;0.75;1" dur="1.6s" repeatCount="indefinite" />
      </BingMark>,
    )
    expect(view.container.querySelector('svg > animate')).not.toBeNull()
  })
})
