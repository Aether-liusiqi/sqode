/** Theme preferences stored in the Host user-settings document. */

import z from '@liusiqi-dev/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Palette presets; orthogonal to {@link THEME_PREFERENCES}. `default` keeps the shipped palette. */
export const THEME_PRESETS = ['default', 'obsidian', 'yayun', 'nebula'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the selected palette preset. */
export const THEME_PRESET_FIELD = 'preset'

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Palette preset persisted alongside the preference. */
export type ThemePreset = typeof THEME_PRESETS[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Preset applied when the document predates the preset dimension. */
export const DEFAULT_PRESET: ThemePreset = 'default'

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 10

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 22

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Selected palette preset. */
  preset: ThemePreset
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [THEME_PRESET_FIELD]: z.union([...THEME_PRESETS]).default(DEFAULT_PRESET),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}

/**
 * Narrow one wire or registry value to a persistable preset.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a known preset.
 */
export function isThemePreset(value: unknown): value is ThemePreset {
  return THEME_PRESETS.some(preset => preset === value)
}
