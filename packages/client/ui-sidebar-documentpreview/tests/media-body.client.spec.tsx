// @vitest-environment jsdom
/** Media Blob ownership, native element selection, and failure states. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@liusiqi-dev/sqh-session/types'
import type { TabId } from '@liusiqi-dev/sqh-client-ui-dockkit'
import { MediaBody, type MediaBodyProps } from '../src/client/media/MediaBody.tsx'
import { en } from '../src/client/media/locales.ts'

const translations: ReadonlyMap<string, string> = new Map(Object.entries(en))
let createDescriptor: PropertyDescriptor | undefined
let revokeDescriptor: PropertyDescriptor | undefined
const create = vi.fn<(blob: Blob) => string>()
const revoke = vi.fn<(url: string) => void>()

beforeEach(() => {
  createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  create.mockReset().mockImplementation(() => `blob:https://preview.invalid/${create.mock.calls.length}`)
  revoke.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
})

afterEach(() => {
  try { cleanup() } finally {
    if (createDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL')
    else Object.defineProperty(URL, 'createObjectURL', createDescriptor)
    if (revokeDescriptor === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL')
    else Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
    vi.restoreAllMocks()
  }
})

function props(path = 'clip.mp4', content: MediaBodyProps['content'] = { kind: 'bytes', data: new Uint8Array([1, 2, 3]) },
  controller = new AbortController()): MediaBodyProps {
  return {
    resourceAddress: `sqh-resource://file/session/media/${path}`,
    content,
    wrap: false,
    sessionId: 'media' as SessionId,
    useTabInfo: () => ({ tab: { id: 'media-tab' as TabId, signal: controller.signal } }),
    useResource: () => ({ value: undefined }),
    scrollportRef: vi.fn(),
    t: (key, params) => {
      const value = translations.get(key) ?? key
      return params === undefined ? value : Object.entries(params)
        .reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), value)
    },
  } as MediaBodyProps
}

describe('MediaBody', () => {
  it.each([
    ['mp4', 'video/mp4', 'video'],
    ['webm', 'video/webm', 'video'],
    ['mov', 'video/quicktime', 'video'],
    ['mkv', 'video/x-matroska', 'video'],
    ['mp3', 'audio/mpeg', 'audio'],
    ['wav', 'audio/wav', 'audio'],
    ['flac', 'audio/flac', 'audio'],
    ['ogg', 'audio/ogg', 'audio'],
  ] as const)('renders .%s as a controlled %s element from the %s Blob type', async (extension, mediaType, tag) => {
    const view = render(<MediaBody {...props(`clip.${extension}`)} />)
    const element = await vi.waitFor(() => {
      const found = view.container.querySelector(tag)
      expect(found).not.toBeNull()
      return found as HTMLMediaElement
    })
    expect(create.mock.calls[0]?.[0].type).toBe(mediaType)
    expect(element.getAttribute('src')).toBe('blob:https://preview.invalid/1')
    expect(element.controls).toBe(true)
    expect(element.getAttribute('aria-label')).toContain('clip')
  })

  it('revokes the object URL when the pane unmounts', async () => {
    const view = render(<MediaBody {...props()} />)
    await vi.waitFor(() => expect(view.container.querySelector('video')).not.toBeNull())
    view.unmount()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:https://preview.invalid/1')
  })

  it('revokes the previous URL and swaps the source when the bytes change', async () => {
    const original = props('clip.mp4')
    const view = render(<MediaBody {...original} />)
    await vi.waitFor(() => expect(view.container.querySelector('video')).not.toBeNull())
    view.rerender(<MediaBody {...{
      ...original,
      content: { kind: 'bytes', data: new Uint8Array([9, 8, 7]) },
    }} />)
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/1')
    expect(view.container.querySelector('video')?.getAttribute('src')).toBe('blob:https://preview.invalid/2')
  })

  it('reports unsupported content when the renderer did not receive bytes', () => {
    render(<MediaBody {...props('clip.mp4', { kind: 'text', text: '', pages: [], eof: true })} />)
    expect(screen.getByRole('alert').textContent).toBe(en.unsupported)
    expect(create).not.toHaveBeenCalled()
  })

  it('reports unsupported content for an unregistered suffix', () => {
    render(<MediaBody {...props('clip.xyz')} />)
    expect(screen.getByRole('alert').textContent).toBe(en.unsupported)
    expect(create).not.toHaveBeenCalled()
  })

  it('reports a failure when the object URL cannot be created', async () => {
    create.mockImplementationOnce(() => { throw new Error('no blob') })
    render(<MediaBody {...props()} />)
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe(en.failed))
  })

  it('reports a failure when the native element cannot decode the source', async () => {
    const view = render(<MediaBody {...props()} />)
    const video = await vi.waitFor(() => {
      const found = view.container.querySelector('video')
      expect(found).not.toBeNull()
      return found as HTMLVideoElement
    })
    fireEvent.error(video)
    expect(screen.getByRole('alert').textContent).toBe(en.failed)
  })
})
