/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState } from 'react'
import { TextShimmer } from '@liusiqi-dev/sqh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

/** The eight visual identities the running indicator can cycle through. */
const ORB_CYCLE: OrbState[] = [
  'working', 'searching', 'solving', 'connecting', 'composing', 'breathing', 'shaping', 'listening',
]

interface RunningStatusProps {
  readonly startTime: number | undefined
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start time and localized copy.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  const [orb, setOrb] = useState<OrbState>('composing')
  useEffect(() => {
    const id = setInterval(() => {
      setOrb(prev => ORB_CYCLE[(ORB_CYCLE.indexOf(prev) + 1) % ORB_CYCLE.length] ?? prev)
    }, 4000)
    return () => { clearInterval(id) }
  }, [])
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t).map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <ThinkingOrb state={orb} size={20} theme="auto" className={css.runningOrb} aria-hidden="true" />
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
