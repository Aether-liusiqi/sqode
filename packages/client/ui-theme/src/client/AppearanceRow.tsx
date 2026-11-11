/**
 * Appearance preference row registered into the General section item slot.
 * One control line carries two independent choices: the palette preset on the
 * left and the light/dark preference on the right. Both follow the persisted
 * values, never the resolved active theme.
 */
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@liusiqi-dev/sqh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@liusiqi-dev/sqh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference writes (t rides the standard locale seat). */
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

/** Palette presets, in the order shown on the left of the control line. */
const PRESETS: readonly { id: string; labelKey: ThemeKey }[] = [
  { id: 'obsidian', labelKey: 'appearance.preset.obsidian' },
  { id: 'yayun', labelKey: 'appearance.preset.yayun' },
  { id: 'nebula', labelKey: 'appearance.preset.nebula' },
]

/** Light/dark preferences, in the order shown on the right of the control line. */
const PREFERENCES: readonly { id: ThemePreference; labelKey: ThemeKey }[] = [
  { id: 'light', labelKey: 'appearance.light' },
  { id: 'dark', labelKey: 'appearance.dark' },
  { id: 'system', labelKey: 'appearance.system' },
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
      <div className={css.controlLine}>
        <div className={css.segment}>
          {PRESETS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={clsx(css.option, preset === id && css.selected)}
              aria-pressed={preset === id}
              onClick={() => { setPreset(id) }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className={css.segment}>
          {PREFERENCES.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={clsx(css.option, preference === id && css.selected)}
              aria-pressed={preference === id}
              onClick={() => { setTheme(id) }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
