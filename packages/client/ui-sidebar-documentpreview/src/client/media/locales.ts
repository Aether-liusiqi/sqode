/** Locale-owned audio/video renderer labels and status text. */
export const zh = {
  title: '音视频',
  preview: '媒体预览：{name}',
  loading: '媒体加载中...',
  failed: '当前浏览器无法播放此媒体文件',
  unsupported: '音视频预览需要完整文件内容',
} satisfies Record<string, string>

/** Media renderer dictionary keys. */
export type MediaPreviewKey = keyof typeof zh

/** English dictionary with the same keys as the Chinese dictionary. */
export const en = {
  title: 'Audio & Video',
  preview: 'Media preview: {name}',
  loading: 'Loading media...',
  failed: 'This browser cannot play this media file.',
  unsupported: 'Media preview requires the complete file contents.',
} satisfies Record<MediaPreviewKey, string>

declare module '@liusiqi-dev/sqh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Media preview selection, accessible name, and status text. */
    sidebarMedia: MediaPreviewKey
  }
}
