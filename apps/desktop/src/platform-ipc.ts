/** Shared names for the desktop Platform bridge. */
/** Private desktop channels; the Platform renderer receives bootstrap and locale updates. */
export const PLATFORM_IPC = {
  bootstrap: 'sqhplatform:bootstrap',
  localeChanged: 'sqhplatform:locale-changed',
  open: 'sqhplatform:open',
  bounds: 'sqhplatform:bounds',
  close: 'sqhplatform:close',
} as const

/** Resolved Platform language; Desktop resolves the system preference before sending it. */
export type PlatformLocale = 'en_US' | 'zh_CN'
