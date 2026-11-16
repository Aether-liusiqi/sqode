/**
 * Form to create an automation task.
 *
 * The form composes an instruction for the model to call the `schedule_create`
 * agent tool exactly once with the chosen timing selector. It opens a dedicated
 * session so the task keeps a continuous conversation history across runs.
 */
import { useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@liusiqi-dev/cordis'
import {
  Button, IconCloseOutlineRegular, IconFolderOpenOutlineRegular, IconSkillOutlineRegular, Input,
  Modal, SegmentedTabs, useDismissOnOutsidePointer, type SegmentedTab,
} from '@liusiqi-dev/sqh-client-ui-primitives'
import clsx from 'clsx'
import type { TranslateNS } from '@liusiqi-dev/sqh-client-ui-slots'
import { buildMultiTimeCron } from './schedule-create-selector.ts'
import css from './ScheduleCreateForm.module.css'

type ManagerTranslate = TranslateNS<'schedule.manager'>

type Frequency = 'daily' | 'times' | 'every' | 'once'

const HOURS = Array.from({ length: 24 }, (_, index) => index)

type Remote = ClientContext['remote']
type PresetRow = Extract<Awaited<ReturnType<Remote['agentPresets']['list']>>, { ok: true }>['value']['presets'][number]
type SkillEntry = Extract<Awaited<ReturnType<Remote['skills']['list']>>, { ok: true }>['value']['skills'][number]

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Props for the automation-task creation form. */
export interface ScheduleCreateFormProps {
  /** Client context: sessions, remotes, and workspace navigation. */
  readonly ctx: ClientContext
  /** Localized copy for the `schedule.manager` namespace. */
  readonly t: ManagerTranslate
  /** Whether the dialog is open. */
  readonly open: boolean
  /** Close command from the header button, mask, or Escape. */
  readonly onClose: () => void
}

/**
 * Render the modal form that creates an automation task in its own session.
 * @param props.ctx - client context for sessions, remotes, and navigation.
 * @param props.t - localized `schedule.manager` copy.
 * @param props.open - dialog visibility.
 * @param props.onClose - close handler.
 * @returns the form modal, or null when closed.
 */
export function ScheduleCreateForm({ ctx, t, open, onClose }: ScheduleCreateFormProps) {
  const [name, setName] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [presetId, setPresetId] = useState('auto')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [time, setTime] = useState('00:00')
  const [intervalHours, setIntervalHours] = useState(1)
  const [onceDate, setOnceDate] = useState(localDate)
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([])
  const [selectedHours, setSelectedHours] = useState<number[]>([])
  const [minute, setMinute] = useState(30)
  const [presets, setPresets] = useState<PresetRow[]>([])
  const [skillsCatalog, setSkillsCatalog] = useState<SkillEntry[]>([])
  const [skillsListable, setSkillsListable] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const skillsWrap = useRef<HTMLSpanElement>(null)
  useDismissOnOutsidePointer(skillsWrap, skillsOpen, setSkillsOpen)
  const [error, setError] = useState<'' | Parameters<ManagerTranslate>[0]>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setWorkspaceId('')
    setPrompt('')
    setPresetId('auto')
    setSelectedSkills([])
    setFrequency('daily')
    setTime('00:00')
    setIntervalHours(1)
    setOnceDate(localDate())
    setSelectedWeekdays([])
    setSelectedHours([])
    setMinute(30)
    setPresets([])
    setSkillsCatalog([])
    setSkillsOpen(false)
    setError('')
    setSubmitting(false)
    void loadOptions()
  }, [open])

  const loadOptions = async (): Promise<void> => {
    const presetsResult = await ctx.remote.agentPresets.list()
    if (presetsResult.ok) setPresets([...presetsResult.value.presets])
    const proxy = ctx.sessions.list.getSnapshot().ids[0]
    if (proxy === undefined) {
      setSkillsListable(false)
      return
    }
    setSkillsListable(true)
    try {
      await ctx.sessions.using(proxy, { source: 'scheduleCreate' }, async () => {
        const skillsResult = await ctx.remote.skills.list({ sessionId: proxy })
        if (skillsResult.ok) setSkillsCatalog([...skillsResult.value.skills])
      })
    } catch {
      // Skills stay empty; the catalog simply is not available right now.
    }
  }

  const toggleSkill = (target: string): void => {
    setSelectedSkills(prev => (prev.includes(target) ? prev.filter(item => item !== target) : [...prev, target]))
  }

  const toggleWeekday = (target: number): void => {
    setSelectedWeekdays(prev => (prev.includes(target) ? prev.filter(item => item !== target) : [...prev, target]))
  }

  const toggleHour = (target: number): void => {
    setSelectedHours(prev => (prev.includes(target) ? prev.filter(item => item !== target) : [...prev, target]))
  }

  const buildSelector = (): Record<string, unknown> => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const seconds = `${time}:00`
    if (frequency === 'once') {
      return { at: { date: onceDate, time: seconds, time_zone: zone } }
    }
    if (frequency === 'every') {
      if (selectedWeekdays.length === 0) {
        return { every_seconds: intervalHours * 3600 }
      }
      const dow = [...selectedWeekdays].map(weekday => String(weekday % 7)).sort().join(',')
      return { cron: { expression: `0 */${intervalHours} * * ${dow}`, time_zone: zone } }
    }
    if (frequency === 'times') {
      return { cron: { expression: buildMultiTimeCron(selectedHours, minute, selectedWeekdays), time_zone: zone } }
    }
    if (selectedWeekdays.length === 0) {
      return { daily: { time: seconds, time_zone: zone } }
    }
    return { weekly: { time: seconds, time_zone: zone, weekdays: [...selectedWeekdays].sort((left, right) => left - right) } }
  }

  const buildPrompt = (): string => {
    const skillTokens = selectedSkills.map(skill => `/${skill}`).join(' ')
    const promptText = prompt.trim() + (skillTokens === '' ? '' : `\n\n可用技能：${skillTokens}`)
    const payload = { title: name.trim(), prompt: promptText, ...buildSelector() }
    return (
      '请使用 schedule_create 工具创建一条自动化任务，只调用这一次，不要输出其它内容。'
      + '参数（JSON）：\n' + JSON.stringify(payload, null, 2)
      + '\n其中 prompt 字段是任务触发时执行的指令；所选技能已以 /技能名 形式写入 prompt。'
      + '频率参数只包含一个键（daily/weekly/every_seconds/cron/at 之一），请直接调用工具完成。'
    )
  }

  const handleSubmit = async (): Promise<void> => {
    if (name.trim() === '') {
      setError('form.error.name')
      return
    }
    if (prompt.trim() === '') {
      setError('form.error.prompt')
      return
    }
    if (frequency === 'times' && selectedHours.length === 0) {
      setError('form.error.hours')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const id = await ctx.sessions.create({
        ...(workspaceId === '' ? {} : { workspaceId: workspaceId as Required<NonNullable<Parameters<typeof ctx.sessions.create>[0]>>['workspaceId'] }),
      })
      await ctx.sessions.using(id, { source: 'scheduleCreate' }, async () => {
        if (presetId !== 'auto') {
          const selected = await ctx.remote.agentPresets.select(id, presetId)
          if (!selected.ok) throw new Error('agent preset select failed')
        }
        const scoped = ctx.sessions.scope(id)
        if (scoped === undefined) throw new Error('session scope unavailable')
        const conversation = scoped.get('conversation')
        if (conversation === undefined) throw new Error('conversation channel unavailable')
        await conversation.send(buildPrompt())
      })
      onClose()
      ctx.uiWorkspace.openSession(id)
    } catch {
      setError('form.error.submit')
      setSubmitting(false)
    }
  }

  const frequencyTabs: [SegmentedTab<Frequency>, ...SegmentedTab<Frequency>[]] = [
    { value: 'daily', label: t('form.tabDaily'), id: 'freq-daily', panelId: 'freq-daily-panel' },
    { value: 'times', label: t('form.tabTimes'), id: 'freq-times', panelId: 'freq-times-panel' },
    { value: 'every', label: t('form.tabEvery'), id: 'freq-every', panelId: 'freq-every-panel' },
    { value: 'once', label: t('form.tabOnce'), id: 'freq-once', panelId: 'freq-once-panel' },
  ]

  const workspaces = ctx.workspaces.list.getSnapshot().items

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('form.title')}
      closeLabel={t('form.close')}
      description={t('form.description')}
      contentClassName={css.scroll ?? ''}
      floating
      footer={<div className={css.footerActions}>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>{t('form.cancel')}</Button>
        <Button variant="primary" size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? t('form.submitting') : t('form.submit')}
        </Button>
      </div>}
    >
      <div className={css.form}>
        <label className={css.field}>
          <span className={css.label}>{t('form.name')}</span>
          <Input
            value={name}
            placeholder={t('form.namePlaceholder')}
            data-modal-autofocus
            onChange={(event) => { setName(event.target.value) }}
          />
        </label>

        <label className={css.field}>
          <span className={css.label}>{t('form.workspace')}</span>
          <span className={css.selectWrap}>
            <IconFolderOpenOutlineRegular size={14} className={css.selectIcon} />
            <select
              className={css.select}
              value={workspaceId}
              onChange={(event) => { setWorkspaceId(event.target.value) }}
            >
              <option value="">{t('form.workspacePlaceholder')}</option>
              {workspaces.map(workspace => (
                <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>
              ))}
            </select>
          </span>
        </label>

        <div className={css.field}>
          <span className={css.label}>{t('form.prompt')}</span>
          {selectedSkills.length > 0 && (
            <div className={css.skillChips}>
              {selectedSkills.map(skill => (
                <span key={skill} className={css.skillChip}>
                  /{skill}
                  <button
                    type="button"
                    className={css.skillChipRemove}
                    aria-label={t('form.removeSkill')}
                    onClick={() => { toggleSkill(skill) }}
                  >
                    <IconCloseOutlineRegular size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            className={css.textarea}
            value={prompt}
            placeholder={t('form.promptPlaceholder')}
            rows={4}
            onChange={(event) => { setPrompt(event.target.value) }}
          />
          <div className={css.promptTools}>
            <span className={css.selectWrap}>
              <select
                className={css.select}
                value={presetId}
                aria-label={t('form.model')}
                onChange={(event) => { setPresetId(event.target.value) }}
              >
                <option value="auto">{t('form.modelAuto')}</option>
                {presets.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name ?? preset.id}</option>
                ))}
              </select>
            </span>
            {skillsListable
              ? (
                <span className={css.skillsWrap} ref={skillsWrap}>
                  <button
                    type="button"
                    className={clsx(css.skillsTrigger, skillsOpen && css.skillsTriggerActive)}
                    onClick={() => { setSkillsOpen(open => !open) }}
                  >
                    <IconSkillOutlineRegular size={14} />
                    {t('form.skills')}
                  </button>
                  {skillsOpen && (
                    <div className={css.skillsPanel}>
                      {skillsCatalog.length === 0
                        ? <span className={css.skillsEmpty}>—</span>
                        : skillsCatalog.map(skill => (
                          <label key={skill.name} className={css.skillOption}>
                            <input
                              type="checkbox"
                              checked={selectedSkills.includes(skill.name)}
                              onChange={() => { toggleSkill(skill.name) }}
                            />
                            <span>{skill.name}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </span>
              )
              : <span className={css.skillsHint}>{t('form.skillsNoSession')}</span>}
          </div>
        </div>

        <div className={css.field}>
          <span className={css.label}>{t('form.frequency')}</span>
          <SegmentedTabs items={frequencyTabs} value={frequency} onChange={setFrequency} label={t('form.frequency')} />
          <div className={css.frequencyBody}>
            <div className={css.timeRow}>
              {frequency === 'times'
                ? (
                  <>
                    <input
                      type="number"
                      className={css.timeInput}
                      min={0}
                      max={59}
                      value={minute}
                      aria-label={t('form.minuteUnit')}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setMinute(Number.isFinite(next) ? Math.min(59, Math.max(0, next)) : 0)
                      }}
                    />
                    <span className={css.intervalUnit}>{t('form.minuteUnit')}</span>
                  </>
                )
                : (
                  <input
                    type="time"
                    className={css.timeInput}
                    value={time}
                    onChange={(event) => { setTime(event.target.value) }}
                  />
                )}
              {frequency === 'every' && (
                <span className={css.intervalRow}>
                  <button
                    type="button"
                    className={css.stepper}
                    aria-label={t('form.intervalDown')}
                    onClick={() => { setIntervalHours(hours => Math.max(1, hours - 1)) }}
                  >−</button>
                  <span className={css.intervalValue}>{intervalHours}</span>
                  <button
                    type="button"
                    className={css.stepper}
                    aria-label={t('form.intervalUp')}
                    onClick={() => { setIntervalHours(hours => Math.min(168, hours + 1)) }}
                  >+</button>
                  <span className={css.intervalUnit}>{t('form.intervalHours')}</span>
                </span>
              )}
              {frequency === 'once' && (
                <input
                  type="date"
                  className={css.dateInput}
                  value={onceDate}
                  onChange={(event) => { setOnceDate(event.target.value) }}
                />
              )}
            </div>
            {frequency === 'times' && (
              <div className={css.weekdayRow}>
                <span className={css.weekdayLabel}>{t('form.hours')}</span>
                {HOURS.map(hour => (
                  <button
                    key={hour}
                    type="button"
                    className={clsx(css.weekdayChip, selectedHours.includes(hour) && css.weekdayChipActive)}
                    onClick={() => { toggleHour(hour) }}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            )}
            <div className={css.weekdayRow}>
              <span className={css.weekdayLabel}>{t('form.weekdays')}</span>
              {WEEKDAYS.map(weekday => (
                <button
                  key={weekday}
                  type="button"
                  className={clsx(css.weekdayChip, selectedWeekdays.includes(weekday) && css.weekdayChipActive)}
                  onClick={() => { toggleWeekday(weekday) }}
                >
                  {t(`form.weekday.${weekday}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error !== '' && <p className={css.error}>{t(error)}</p>}
      </div>
    </Modal>
  )
}
