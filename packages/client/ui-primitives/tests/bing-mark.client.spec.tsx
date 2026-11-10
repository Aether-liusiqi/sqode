// @vitest-environment jsdom
/** The Bing-form master is the single source of truth for every brand mark. */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BING_MARK_PATHS, BingMark } from '../src/BingMark.tsx'

const MASTER = {
  upper: 'M836 284 C836 192 692 164 520 188 C348 212 224 288 224 392 C224 456 300 500 416 500',
  lower: 'M608 500 C712 500 784 540 784 656 C784 760 664 812 500 812 C438 812 388 804 344 792',
  caret: 'M200 752 L200 860',
}

describe('BingMark', () => {
  it('keeps the three master strokes verbatim', () => {
    expect(BING_MARK_PATHS).toEqual(MASTER)
  })

  it('scales the 1024 master to the requested size', () => {
    const view = render(<BingMark size={34} />)
    const svg = view.container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 1024')
    expect(svg.getAttribute('width')).toBe('34')
    expect(svg.getAttribute('height')).toBe('34')
    expect(svg.querySelectorAll('path')).toHaveLength(3)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('appends host-owned animation children inside the stroke group', () => {
    const view = render(
      <BingMark size={34}>
        <animate attributeName="opacity" values="1;0.75;1" dur="1.6s" repeatCount="indefinite" />
      </BingMark>,
    )
    expect(view.container.querySelector('g > animate')).not.toBeNull()
  })
})
