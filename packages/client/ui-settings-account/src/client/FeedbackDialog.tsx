/**
 * Local feedback form.
 *
 * The report is written to the data directory by the desktop shell and never sent
 * anywhere, so the dialog's job is to collect enough structure to act on later:
 * which areas are involved, and what the user wants to say about them.
 */
import { useState } from 'react'
import { Button, IconCloseOutlineRegular, Modal } from '@liusiqi-dev/dsh-client-ui-primitives'
import type { AccountKey } from './locales.ts'
import css from './FeedbackDialog.module.css'

/** Quick topics offered as checkboxes; the identifiers are what get stored. */
const TOPICS = [
  ['modelAccess', 'feedbackTopicModel'],
  ['search', 'feedbackTopicSearch'],
  ['plugins', 'feedbackTopicPlugins'],
  ['interface', 'feedbackTopicInterface'],
  ['performance', 'feedbackTopicPerformance'],
  ['other', 'feedbackTopicOther'],
] as const satisfies readonly (readonly [string, AccountKey])[]

/** Bridge shape this dialog needs; absent outside the desktop shell. */
interface FeedbackBridge {
  save(report: {
    topics: readonly string[]
    details: string
    version?: string
    locale?: string
  }): Promise<{ path: string }>
}

/**
 * Read the desktop feedback bridge when the shell exposed one.
 * @returns the bridge, or undefined in a browser-only deployment.
 */
export function feedbackBridge(): FeedbackBridge | undefined {
  return (globalThis as typeof globalThis & { dshDesktop?: { feedback?: FeedbackBridge } }).dshDesktop?.feedback
}

/** @param props - localized copy and close action. @returns the feedback dialog. */
export function FeedbackDialog({ close, t }: { close: () => void; t: (key: AccountKey) => string }) {
  const [selected, setSelected] = useState<readonly string[]>([])
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string>()
  const [failed, setFailed] = useState(false)
  const bridge = feedbackBridge()
  const filled = selected.length > 0 || details.trim().length > 0
  const dismiss = (): void => { if (!busy) close() }
  const toggle = (topic: string): void => {
    setSelected(current => current.includes(topic) ? current.filter(item => item !== topic) : [...current, topic])
  }
  const submit = async (): Promise<void> => {
    if (bridge === undefined || !filled || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const result = await bridge.save({
        topics: selected,
        details,
        ...process.env.SQODE_CLIENT_VERSION === undefined ? {} : { version: process.env.SQODE_CLIENT_VERSION },
        locale: document.documentElement.lang === 'zh' ? 'zh-CN' : 'en',
      })
      setSaved(result.path)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return <Modal open headless title={t('feedbackTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.content}>
      <div className={css.header}>
        <h2 className={css.title}>{t('feedbackTitle')}</h2>
        <button type="button" className={css.close} aria-label={t('close')} disabled={busy} onClick={dismiss}>
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      <div className={css.body}>
        <p className={css.intro}>{t('feedbackIntro')}</p>
        <div className={css.topics}>
          {TOPICS.map(([topic, key]) => <label key={topic} className={css.topic}>
            <input
              type="checkbox"
              checked={selected.includes(topic)}
              disabled={busy || saved !== undefined}
              onChange={() => { toggle(topic) }}
            />
            <span>{t(key)}</span>
          </label>)}
        </div>
        <p className={css.label}>{t('feedbackDetailsLabel')}</p>
        <textarea
          className={css.details}
          value={details}
          placeholder={t('feedbackDetailsPlaceholder')}
          disabled={busy || saved !== undefined}
          onChange={(event) => { setDetails(event.target.value) }}
        />
      </div>
      {saved === undefined ? null : <p className={css.status}>{t('feedbackSaved')}<br />{saved}</p>}
      {failed ? <p className={`${css.status} ${css.failed}`}>{t('feedbackFailed')}</p> : null}
      <div className={css.actions}>
        {saved === undefined
          ? <>
            <Button variant="outline" onClick={dismiss} disabled={busy}>{t('cancel')}</Button>
            <Button onClick={() => void submit()} disabled={busy || !filled}>{t('feedbackSubmit')}</Button>
          </>
          : <Button onClick={dismiss}>{t('close')}</Button>}
      </div>
    </div>
  </Modal>
}
