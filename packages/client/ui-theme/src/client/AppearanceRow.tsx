/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutlineMedium, IconFollowsystemOutlineMedium, IconLightOutlineMedium,
} from '@liusiqi-dev/sqh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@liusiqi-dev/sqh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@liusiqi-dev/sqh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Switch the palette preset. */
  setPreset: (id: string) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutlineMedium }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutlineMedium },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutlineMedium },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutlineMedium },
]

/** Palette presets; the swatch colour is each theme's light-mode link token. */
const PRESETS: readonly { id: string; labelKey: ThemeKey; swatch: string }[] = [
  { id: 'default', labelKey: 'appearance.preset.default', swatch: '#4176e6' },
  { id: 'obsidian', labelKey: 'appearance.preset.obsidian', swatch: '#0369a1' },
  { id: 'yayun', labelKey: 'appearance.preset.yayun', swatch: '#876740' },
  { id: 'nebula', labelKey: 'appearance.preset.nebula', swatch: '#5b4bd6' },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setPreset, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const preset = useStore(s => s.preset)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.presetTitle}>{t('appearance.presetTitle')}</div>
      <div className={css.cubeRow}>
        {PRESETS.map(({ id, labelKey, swatch }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.presetCube, preset === id && css.selected)}
            aria-pressed={preset === id}
            onClick={() => { setPreset(id) }}
          >
            <span className={css.swatch} style={{ backgroundColor: swatch }} aria-hidden="true" />
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
