/** `settings.theme` namespace dictionaries (the Appearance and font-size rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  'appearance.preset.obsidian': '曜黑',
  'appearance.preset.yayun': '雅韵',
  'appearance.preset.nebula': '星云',
  'fontSize.title': '字号大小',
  'fontSize.description': '仅影响会话内容的字号',
  'fontSize.unit': 'px',
  'fontSize.increase': '增大字号',
  'fontSize.decrease': '减小字号',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.preset.obsidian': 'Obsidian',
  'appearance.preset.yayun': 'Elegant',
  'appearance.preset.nebula': 'Nebula',
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
} satisfies Record<ThemeKey, string>
