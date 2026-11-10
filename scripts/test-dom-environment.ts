/** Initial resize delivery from jsdom's modeled offsets; geometry/timing suites supply their own observers. */
import { afterAll, beforeEach } from 'vitest'

const original = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
const originalIntersection = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
const originalMatchMedia = typeof window === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(window, 'matchMedia')
let installed = false
let intersectionInstalled = false
let matchMediaInstalled = false

class TestResizeObserver implements ResizeObserver {
  private readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    if (this.targets.has(target)) return
    this.targets.add(target)
    const width = target instanceof HTMLElement ? target.offsetWidth : 0
    const height = target instanceof HTMLElement ? target.offsetHeight : 0
    const size = [{ inlineSize: width, blockSize: height }]
    this.callback([{
      target, contentRect: new DOMRectReadOnly(0, 0, width, height),
      borderBoxSize: size, contentBoxSize: size, devicePixelContentBoxSize: size,
    }], this)
  }

  unobserve(target: Element): void { this.targets.delete(target) }

  disconnect(): void { this.targets.clear() }
}


/**
 * jsdom implements no IntersectionObserver, and several canvas/motion wrappers
 * construct one unconditionally. This stub records targets and never delivers a
 * callback: suites that assert on intersection behaviour install their own.
 */
class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = '0px'
  readonly scrollMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number> = [0]
  private readonly targets = new Set<Element>()

  constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.root = (options?.root as Element | Document | null) ?? null
    this.rootMargin = options?.rootMargin ?? '0px'
    const threshold = options?.threshold
    this.thresholds = Array.isArray(threshold)
      ? threshold
      : [threshold ?? 0]
  }

  observe(target: Element): void { this.targets.add(target) }
  unobserve(target: Element): void { this.targets.delete(target) }
  disconnect(): void { this.targets.clear() }
  takeRecords(): IntersectionObserverEntry[] { return [] }
}


/**
 * jsdom implements no matchMedia, and border-beam calls it during useState
 * initialisation — a missing function throws in render and React drops the
 * whole subtree. Return a light-mode MediaQueryList so the component can render;
 * suites asserting on media state install their own.
 */
function testMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
}

beforeEach(() => {
  if (typeof document !== 'undefined' && typeof ResizeObserver === 'undefined') {
    // Establish the per-environment default, so vi.unstubAllGlobals restores it.
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver })
    installed = true
  }
  if (typeof document !== 'undefined' && typeof IntersectionObserver === 'undefined') {
    // Same contract as the resize stub: a per-environment default that
    // vi.unstubAllGlobals restores.
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true, writable: true, value: TestIntersectionObserver,
    })
    intersectionInstalled = true
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true, value: testMatchMedia,
    })
    matchMediaInstalled = true
  }
})

afterAll(() => {
  if (installed) {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'ResizeObserver')
    else Object.defineProperty(globalThis, 'ResizeObserver', original)
  }
  if (intersectionInstalled) {
    if (originalIntersection === undefined) Reflect.deleteProperty(globalThis, 'IntersectionObserver')
    else Object.defineProperty(globalThis, 'IntersectionObserver', originalIntersection)
  }
  if (matchMediaInstalled && typeof window !== 'undefined') {
    if (originalMatchMedia === undefined) Reflect.deleteProperty(window, 'matchMedia')
    else Object.defineProperty(window, 'matchMedia', originalMatchMedia)
  }
})
