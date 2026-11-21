/** Complete audio/video bytes rendered by the browser's native media element. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@liusiqi-dev/sqh-client-ui-slots'
import { pathPartsOf } from '@liusiqi-dev/sqh-util-workspace-path'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { hostFileOf } from '../rpc.ts'
import type {} from './locales.ts'
import css from './MediaBody.module.css'

/** Extension to Blob media type and native element kind. */
interface MediaType {
  readonly type: string
  readonly kind: 'audio' | 'video'
}

const MEDIA_TYPES: Readonly<Record<string, MediaType>> = {
  mp4: { type: 'video/mp4', kind: 'video' },
  m4v: { type: 'video/mp4', kind: 'video' },
  webm: { type: 'video/webm', kind: 'video' },
  mov: { type: 'video/quicktime', kind: 'video' },
  avi: { type: 'video/x-msvideo', kind: 'video' },
  mkv: { type: 'video/x-matroska', kind: 'video' },
  flv: { type: 'video/x-flv', kind: 'video' },
  wmv: { type: 'video/x-ms-wmv', kind: 'video' },
  ogv: { type: 'video/ogg', kind: 'video' },
  '3gp': { type: 'video/3gpp', kind: 'video' },
  mp3: { type: 'audio/mpeg', kind: 'audio' },
  wav: { type: 'audio/wav', kind: 'audio' },
  m4a: { type: 'audio/mp4', kind: 'audio' },
  aac: { type: 'audio/aac', kind: 'audio' },
  flac: { type: 'audio/flac', kind: 'audio' },
  ogg: { type: 'audio/ogg', kind: 'audio' },
  oga: { type: 'audio/ogg', kind: 'audio' },
  opus: { type: 'audio/ogg', kind: 'audio' },
  wma: { type: 'audio/x-ms-wma', kind: 'audio' },
  aif: { type: 'audio/aiff', kind: 'audio' },
  aiff: { type: 'audio/aiff', kind: 'audio' },
}

/** Standard document props plus the media renderer's dictionary. */
export type MediaBodyProps = DocumentPreviewProps & PropsLocale<'sidebarMedia'>

type MediaSource =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly media: MediaType; readonly url: string }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly media: MediaType }

/**
 * Resolve a supported filename to its Blob media type and element kind.
 * @param path - decoded workspace file path.
 * @returns the media type, or undefined for an unregistered suffix.
 */
export function mediaTypeOf(path: string): MediaType | undefined {
  const normalized = path.replaceAll('\\', '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  const extension = name.slice(name.lastIndexOf('.') + 1)
  return MEDIA_TYPES[extension]
}

/**
 * Present complete audio/video bytes with the browser's native controls.
 * @param props - document bytes, resource identity, and locale.
 * @returns a native audio or video player fed by an object URL.
 */
export function MediaBody(props: MediaBodyProps): ReactNode {
  const { content, resourceAddress, t } = props
  const path = useMemo(() => hostFileOf(resourceAddress).path, [resourceAddress])
  const media = mediaTypeOf(path)
  const data = content.kind === 'bytes' ? content.data : undefined
  const [source, setSource] = useState<MediaSource>()

  useEffect(() => {
    if (data === undefined || media === undefined) return
    let url: string | undefined
    try {
      url = URL.createObjectURL(new Blob([data], { type: media.type }))
      setSource({ kind: 'ready', data, media, url })
    } catch {
      setSource({ kind: 'failed', data, media })
    }
    return () => {
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }, [data, media])

  if (data === undefined || media === undefined) {
    return <p className={css.status} role="alert">{t('unsupported')}</p>
  }
  if (source?.data !== data || source.media !== media) {
    return <LoadingIndicator label={t('loading')} />
  }
  if (source.kind === 'failed') return <p className={css.status} role="alert">{t('failed')}</p>
  const { name } = pathPartsOf(path)
  return <LoadedMedia key={source.url} url={source.url} media={media} name={name} t={t} />
}

/** Native media element with a decode-failure state. */
function LoadedMedia({ url, media, name, t }: {
  readonly url: string
  readonly media: MediaType
  readonly name: string
  readonly t: MediaBodyProps['t']
}): ReactNode {
  const [failed, setFailed] = useState(false)
  if (failed) return <p className={css.status} role="alert">{t('failed')}</p>
  const label = t('preview', { name })
  if (media.kind === 'video') {
    return (
      <div className={css.frame}>
        <video className={css.player} data-media-preview src={url} controls playsInline preload="metadata"
          aria-label={label} onError={() => { setFailed(true) }} />
      </div>
    )
  }
  return (
    <div className={css.frame}>
      <audio className={css.audio} data-media-preview src={url} controls preload="metadata"
        aria-label={label} onError={() => { setFailed(true) }} />
    </div>
  )
}
