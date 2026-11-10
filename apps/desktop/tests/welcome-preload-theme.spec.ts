// @vitest-environment jsdom
/** The welcome preload must project the native theme source onto the body. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

const originalArgv = process.argv.slice()

beforeEach(() => {
  document.body.removeAttribute('data-ds-dark-theme')
  vi.resetModules()
  process.argv.length = 0
  process.argv.push(...originalArgv)
})

afterEach(() => {
  process.argv.length = 0
  process.argv.push(...originalArgv)
  document.body.removeAttribute('data-ds-dark-theme')
  vi.restoreAllMocks()
})

async function loadPreload(theme: string): Promise<void> {
  process.argv.push('--sqh-welcome-locale=zh-CN', `--sqh-welcome-theme=${theme}`)
  await import('../src/preload-welcome.ts')
}

it('projects a manual dark choice onto the body attribute', async () => {
  await loadPreload('dark')
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
})

it('leaves the body in light mode for a manual light choice', async () => {
  await loadPreload('light')
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
})

it('falls back to system when the launch argument is absent', async () => {
  process.argv.push('--sqh-welcome-locale=zh-CN')
  await import('../src/preload-welcome.ts')
  // The jsdom environment's matchMedia stub reports a light preference.
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
})
