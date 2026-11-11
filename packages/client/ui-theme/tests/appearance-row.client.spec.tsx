// @vitest-environment jsdom
import type { GlobalStandardProps } from '@liusiqi-dev/sqh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@liusiqi-dev/sqh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@liusiqi-dev/sqh-api-workspace-controller/client'
import { createSnapshotStore } from '@liusiqi-dev/sqh-client-store'
import { bindSnapshotSelector } from '@liusiqi-dev/sqh-client-test-runtime'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import type { AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { ThemePreference, ThemePreset } from '../src/theme-settings.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.preset.obsidian': 'Obsidian',
  'appearance.preset.yayun': 'Elegant',
  'appearance.preset.nebula': 'Nebula',
}

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<AppearanceRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: AppearanceRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(preference: ThemePreference = 'system', preset: ThemePreset = 'default') {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createAppearanceRowStore().create()
  store.actions.sync(preference, preset, 0)
  const setTheme = vi.fn()
  const setPreset = vi.fn()
  const props: AppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setTheme, setPreset,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme, setPreset }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('AppearanceRow', () => {
  it('renders one control line with three presets and three preferences, no default option', () => {
    mount('dark')
    expect(screen.getByText('Appearance')).toBeDefined()
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.queryByText('Default')).toBeNull()
    expect(screen.queryByText('Theme style')).toBeNull()
    expect(pressed(/Dark/)).toBe('true')
    expect(pressed(/Light/)).toBe('false')
    expect(pressed(/System/)).toBe('false')
  })

  it('click drives setPreset; selection follows the store mirror', () => {
    const b = mount('system')
    expect(pressed(/Obsidian/)).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /Obsidian/ }))
    expect(b.setPreset).toHaveBeenCalledWith('obsidian')
    // No store write yet: the click alone does not select.
    expect(pressed(/Obsidian/)).toBe('false')
    act(() => { b.store.actions.sync('system', 'obsidian', 1) })
    expect(pressed(/Obsidian/)).toBe('true')
    expect(pressed(/Elegant/)).toBe('false')
    expect(pressed(/Nebula/)).toBe('false')
  })

  it('click drives setTheme; selection follows the store mirror, not the click echo', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('button', { name: /Light/ }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    // No store write yet: selection is unchanged.
    expect(pressed(/Dark/)).toBe('true')
    act(() => { b.store.actions.sync('light', 'default', 1) })
    expect(pressed(/Light/)).toBe('true')
    expect(pressed(/Dark/)).toBe('false')
  })
})
