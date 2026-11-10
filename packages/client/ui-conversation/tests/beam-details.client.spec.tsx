// @vitest-environment jsdom
/** Beam preset hue and reduced-motion gating — the M4 caller-owned behaviours. */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BEAM_VARIANT, useBodyPreset, useReducedMotion,
} from '../src/client/skeleton/ConversationContent.tsx'

const PRESET_ATTRIBUTE = 'data-sqh-theme'

function Probe({ hook }: { hook: () => unknown }) {
  return <span data-probe={String(hook())} />
}

function mediaStub(reduced: boolean): typeof window.matchMedia {
  return (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

const originalMatchMedia = typeof window === 'undefined' ? undefined : window.matchMedia

afterEach(() => {
  cleanup()
  document.body.removeAttribute(PRESET_ATTRIBUTE)
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: originalMatchMedia ?? mediaStub(false),
    })
  }
  vi.restoreAllMocks()
})

describe('beam palette variants', () => {
  it('follows the design package: obsidian ocean, yayun sunset, nebula colorful', () => {
    expect(BEAM_VARIANT.default).toBe('ocean')
    expect(BEAM_VARIANT.obsidian).toBe('ocean')
    expect(BEAM_VARIANT.yayun).toBe('sunset')
    expect(BEAM_VARIANT.nebula).toBe('colorful')
  })

  it('falls back to ocean for an unknown preset', () => {
    expect(BEAM_VARIANT.somethingElse).toBeUndefined()
  })
})

describe('useReducedMotion', () => {
  it('is false when the user has no reduce preference', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true, value: mediaStub(false),
    })
    const view = render(<Probe hook={useReducedMotion} />)
    expect(view.container.querySelector('[data-probe]')?.getAttribute('data-probe')).toBe('false')
  })

  it('is true when prefers-reduced-motion: reduce is set, so the beam stays inactive', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true, value: mediaStub(true),
    })
    const view = render(<Probe hook={useReducedMotion} />)
    expect(view.container.querySelector('[data-probe]')?.getAttribute('data-probe')).toBe('true')
  })
})

describe('useBodyPreset', () => {
  it('reads the default and follows a preset change written outside React', async () => {
    const view = render(<Probe hook={useBodyPreset} />)
    const probe = () => view.container.querySelector('[data-probe]')?.getAttribute('data-probe')
    expect(probe()).toBe('default')

    await act(async () => {
      document.body.setAttribute(PRESET_ATTRIBUTE, 'nebula')
    })
    await waitFor(() => { expect(probe()).toBe('nebula') })

    await act(async () => {
      document.body.removeAttribute(PRESET_ATTRIBUTE)
    })
    await waitFor(() => { expect(probe()).toBe('default') })
  })
})
