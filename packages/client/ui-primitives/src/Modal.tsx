import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEventHandler, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './Modal.module.css'

interface ModalBaseProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  shortcutModal?: string
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>
  backdropBlur?: boolean
  /** Allow dragging by the header and resizing from the bottom-right grip. Off by default. */
  floating?: boolean
}

type ModalProps = ModalBaseProps & (
  | { headless: true; closeLabel?: never }
  | { headless?: false; closeLabel: string }
)

interface DragState {
  pointerId: number
  startX: number
  startY: number
  baseX: number
  baseY: number
}

interface ResizeState {
  pointerId: number
  startX: number
  startY: number
  width: number
  height: number
}

/**
 * Render a centered, body-portaled modal over a blurred page mask.
 * @param props.open - whether the dialog is showing.
 * @param props.onClose - application close command, Escape, or mask click; while a menu is open inside the
 * dialog, Escape belongs to that menu first.
 * @param props.title - dialog heading (aria-label in every mode).
 * @param props.closeLabel - localized accessible close-button label.
 * @param props.description - optional supporting sentence under the title.
 * @param props.children - dialog body; mark its initial-focus control with
 * data-modal-autofocus instead of React autoFocus to preserve return focus.
 * @param props.footer - action row (Cancel / Create).
 * @param props.contentClassName - optional class for a scrollable content region.
 * @param props.backdropBlur - disable when the caller already blurs the page; defaults to true.
 * @param props.shortcutModal - command scope allowed by shortcut owners; unnamed
 * dialogs block application commands unless their owner allows the "other" scope.
 * @param props.headless - render children directly in the card (no default
 * header/close/body chrome); mask, card, Escape, and aria-label remain.
 * @param props.onKeyDownCapture - handle a nested dialog's keys before the document Escape listeners.
 * @param props.floating - drag by the header and resize from the bottom-right grip;
 * defaults to false so the other dialogs keep their centered, fixed layout.
 * @returns null when closed; otherwise the overlay tree.
 */
export function Modal({
  open, onClose, title, closeLabel, description, children, footer, className, contentClassName,
  onKeyDownCapture, headless = false, backdropBlur = true, shortcutModal, floating = false,
}: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null)
  useModalLayer(dialog, open, onClose)

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const drag = useRef<DragState | null>(null)
  const resize = useRef<ResizeState | null>(null)

  useEffect(() => {
    if (!open) return
    setOffset({ x: 0, y: 0 })
    setSize(null)
  }, [open])

  if (!open) return null

  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button') !== null) return
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      baseX: offset.x, baseY: offset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === null || state.pointerId !== event.pointerId) return
    const limitX = window.innerWidth / 2
    const limitY = window.innerHeight / 2
    setOffset({
      x: Math.max(-limitX, Math.min(limitX, state.baseX + event.clientX - state.startX)),
      y: Math.max(-limitY, Math.min(limitY, state.baseY + event.clientY - state.startY)),
    })
  }
  const onDragEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = dialog.current?.getBoundingClientRect()
    if (rect === undefined) return
    resize.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      width: rect.width, height: rect.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = resize.current
    if (state === null || state.pointerId !== event.pointerId) return
    setSize({
      width: Math.max(320, state.width + event.clientX - state.startX),
      height: Math.max(240, state.height + event.clientY - state.startY),
    })
  }
  const onResizeEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (resize.current?.pointerId !== event.pointerId) return
    resize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const floatingStyle: CSSProperties | undefined = floating
    ? {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      ...(size === null ? {} : { width: size.width, height: size.height }),
    }
    : undefined

  return createPortal((
    <div className={css.root} role="presentation" onKeyDownCapture={onKeyDownCapture}>
      <div className={css.mask} style={backdropBlur ? undefined : { backdropFilter: 'none' }} aria-hidden="true" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        data-shortcut-modal={shortcutModal}
        className={clsx(css.dialog, floating && css.floating, className)}
        style={floatingStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {headless
          ? children
          : (
            <>
              <div className={clsx(css.content, contentClassName)}>
                <div
                  className={clsx(css.header, floating && css.dragHandle)}
                  onPointerDown={floating ? onDragStart : undefined}
                  onPointerMove={floating ? onDragMove : undefined}
                  onPointerUp={floating ? onDragEnd : undefined}
                  onPointerCancel={floating ? onDragEnd : undefined}
                >
                  <h2 className={css.title}>{title}</h2>
                  <button type="button" className={css.close} aria-label={closeLabel} onClick={onClose}>
                    <IconCloseOutlineRegular size={14} />
                  </button>
                </div>
                {description !== undefined && description !== '' && (
                  <p className={css.description}>{description}</p>
                )}
                {children !== undefined && <div className={css.body}>{children}</div>}
              </div>
              {footer !== undefined && <div className={css.footer}>{footer}</div>}
            </>
          )}
        {floating && (
          <div
            className={css.resizeHandle}
            aria-hidden="true"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
        )}
      </div>
    </div>
  ), document.body)
}
