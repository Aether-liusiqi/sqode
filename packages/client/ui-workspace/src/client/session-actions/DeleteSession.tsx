/**
 * The delete action: a `sidebar.workspaces.session.menu.item` row and the
 * `shell.overlay` dialog that confirms it. Deletion is permanent — the Host removes
 * the stored log instead of moving it aside — so the dialog says so and offers no
 * undo. There is no hover button on purpose: a destructive action belongs behind the
 * row menu, where a stray click cannot reach it.
 *
 * A Session with running work cannot be deleted at all (the Host refuses it), so the
 * row is disabled up front instead of letting the operator open the dialog and read
 * the refusal there: the disabled row keeps the rule visible before the click, and a
 * cursor tooltip says why.
 */
import { useState } from 'react'
import { Button, IconTrashOutlineRegular, MenuItemButton, Modal } from '@liusiqi-dev/dsh-client-ui-primitives'
import type {
  DeleteSessionInjected, SessionDeleteConfirmProps, SessionDeleteConfirmRequest,
  SessionMenuItemProps,
} from '../contract/slots.ts'
import browserCss from '../rows/WorkspaceBrowser.module.css'

/** Offset that clears the pointer glyph so the bubble never sits under the cursor. */
const TOOLTIP_OFFSET_X = 16
const TOOLTIP_OFFSET_Y = 20

/**
 * Menu row (order 450): delete, after archive at 400.
 *
 * With running work the row renders disabled: a disabled `<button>` receives no
 * pointer events, so the wrapper owns both the `not-allowed` cursor and the bubble
 * that follows the pointer.
 * @param props - owner share, the delete share, and the menu open state.
 * @returns the row.
 */
export function DeleteSessionMenuItem({
  sessionId, running, useMenuOpenState, requestDeleteSession, t,
}: SessionMenuItemProps<DeleteSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  if (!running) {
    return (
      <MenuItemButton
        icon={<IconTrashOutlineRegular size={14} />}
        onSelect={() => {
          setMenuOpen(false)
          requestDeleteSession(sessionId)
        }}
      >
        {t('menu.deleteSession')}
      </MenuItemButton>
    )
  }

  return (
    <span
      className={browserCss.deleteBlocked}
      onPointerMove={(event) => { setPointer({ x: event.clientX, y: event.clientY }) }}
      onPointerLeave={() => { setPointer(null) }}
    >
      <MenuItemButton icon={<IconTrashOutlineRegular size={14} />} disabled onSelect={() => {}}>
        {t('menu.deleteSession')}
      </MenuItemButton>
      {pointer !== null && (
        <span
          role="tooltip"
          className={browserCss.deleteBlockedTip}
          style={{ left: pointer.x + TOOLTIP_OFFSET_X, top: pointer.y + TOOLTIP_OFFSET_Y }}
        >
          {t('menu.deleteSessionRunning')}
        </span>
      )}
    </span>
  )
}

/**
 * The `shell.overlay` entry: nothing while no confirmation is pending, otherwise one
 * dialog per request (keyed by the Session). Confirming asks the Host to delete;
 * cancelling leaves the Session untouched.
 * @param props - the request hook, its settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, settleSessionDelete, deleteSession, t,
}: SessionDeleteConfirmProps) {
  const request = useDeleteRequest(pending => pending)
  if (request === null) return null
  return (
    <DeleteConfirmForm
      key={request.sessionId}
      request={request}
      deleteSession={deleteSession}
      onSettle={settleSessionDelete}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function DeleteConfirmForm({ request, deleteSession, onSettle, t }: {
  request: SessionDeleteConfirmRequest
  deleteSession: SessionDeleteConfirmProps['deleteSession']
  onSettle: () => void
  t: SessionDeleteConfirmProps['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    if (deleting) return
    onSettle()
  }
  const confirm = () => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId).then(() => {
      setDeleting(false)
      onSettle()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('delete.confirm.title')}
      description={t('delete.confirm.desc')}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>{t('cancel')}</Button>
          <Button
            variant="outline"
            className={browserCss.deleteAction}
            disabled={deleting}
            onClick={confirm}
          >
            {t('delete.confirm.action')}
          </Button>
        </>
      )}
    >
      {deleting && <div className={browserCss.deleteStatus} role="status">{t('delete.confirm.pending')}</div>}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}
