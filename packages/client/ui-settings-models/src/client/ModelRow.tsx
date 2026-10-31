/** Shared model fields and actions for both adapter catalog editors. */

import type { ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconTrashOutlineRegular,
} from '@liusiqi-dev/dsh-client-ui-primitives'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { ModelsKey } from './locales.ts'
import { ModelInputTypes } from './ModelInputTypes.tsx'
import styles from './ModelsSection.module.css'

/** A capacity's editable text and adapter-specific inherited hint. */
interface CapacityInput {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onBlur?: () => void
}

/**
 * Quick-pick context sizes, spelled the way this page counts them: `K` is 1000,
 * so `1M` stores 1,000,000. The numeric field below still accepts any count, so a
 * route whose real ceiling is 262,144 or 1,048,576 is not forced onto a preset.
 */
const CAPACITY_PRESETS = [
  { tokens: 300_000, label: 'capacityPreset300k' },
  { tokens: 600_000, label: 'capacityPreset600k' },
  { tokens: 1_000_000, label: 'capacityPreset1m' },
] as const satisfies readonly { tokens: number; label: ModelsKey }[]

/**
 * Drop one field so an emptied control travels as an unset instead of an
 * `undefined` that would overwrite the inherited value with nothing.
 * @param model - the drafted row.
 * @param key - the field the control cleared.
 * @returns a copy without that field.
 */
function withoutCapacity(model: DeepSeekModelDraft, key: 'contextWindow'): DeepSeekModelDraft {
  const next = { ...model }
  Reflect.deleteProperty(next, key)
  return next
}

/**
 * The thinking levels one model offers, as the settings row expresses them.
 *
 * pi-ai stores this as `reasoningEfforts`: which levels the picker may offer and
 * the wire spelling each one sends. A profile carries no per-model default, so a
 * single-level choice here is also that model's default in practice — the picker
 * then has nothing else to select.
 */
export type ReasoningPreset = 'inherit' | 'unsupported' | 'low' | 'high' | 'max' | 'all' | 'custom'

/** Adapter-owned data and actions for one model row. */
interface ModelRowProps {
  model: DeepSeekModelDraft
  position: number
  inputField: 'inputModalities' | 'input'
  inputFallback?: readonly string[] | undefined
  inputLoading?: boolean
  expanded: boolean
  disabled: boolean
  t: (key: ModelsKey) => string
  contextWindow: CapacityInput
  maxTokens: CapacityInput
  /** Present only for adapters that store a per-model reasoning capability. */
  reasoning?: { value: ReasoningPreset; onChange: (preset: ReasoningPreset) => void }
  onFieldChange: (field: 'id' | 'name', value: string | undefined) => void
  onIdBlur?: (value: string) => void
  onChange: (model: DeepSeekModelDraft) => void
  onToggle: () => void
  onRemove: () => void
}

/**
 * Render consistent model identity, capacity, and input-type controls.
 * @param props - drafted fields and their owning editor's actions.
 * @returns one expandable model entry.
 */
export function ModelRow(props: ModelRowProps): ReactNode {
  const { model, position, t, disabled } = props
  return (
    <div className={styles['modelEntry']}>
      <div className={styles['modelRow']}>
        {(['id', 'name'] as const).map(field => (
          <input
            key={field}
            className={styles['input']}
            type="text"
            value={typeof model[field] === 'string' ? model[field] : ''}
            placeholder={t(field === 'id' ? 'modelId' : 'modelName')}
            aria-label={`${t(field === 'id' ? 'modelId' : 'modelName')} ${String(position)}`}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value
              props.onFieldChange(field, field === 'name' && value === '' ? undefined : value)
            }}
            onBlur={field === 'id' ? event => props.onIdBlur?.(event.target.value) : undefined}
          />
        ))}
        <button
          type="button"
          className={styles['iconButton']}
          aria-label={`${t('modelAdvanced')} ${String(position)}`}
          aria-expanded={props.expanded}
          title={t('modelAdvanced')}
          onClick={props.onToggle}
        >
          {props.expanded ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
        </button>
        <button
          type="button"
          className={`${styles['iconButton']} ${styles['iconButtonDanger']}`}
          aria-label={`${t('removeModel')} ${String(position)}`}
          title={t('removeModel')}
          disabled={disabled}
          onClick={props.onRemove}
        >
          <IconTrashOutlineRegular size={14} />
        </button>
      </div>
      {props.expanded
        ? (
          <div className={styles['modelAdvanced']}>
            {/* Presets first: the ceiling a route really enforces is often the
                one number nobody knows, and picking it here beats typing it. */}
            <label className={styles['modelField']}>
              <span className={styles['modelFieldLabel']}>{t('capacityPreset')}</span>
              <select
                className={`${styles['input']} ${styles['selectInput']}`}
                value={CAPACITY_PRESETS.some(preset => preset.tokens === model.contextWindow)
                  ? String(model.contextWindow)
                  : ''}
                aria-label={`${t('capacityPreset')} ${String(position)}`}
                disabled={disabled}
                onChange={(event) => {
                  const tokens = event.target.value === '' ? undefined : Number(event.target.value)
                  props.onChange(tokens === undefined
                    ? withoutCapacity(model, 'contextWindow')
                    : { ...model, contextWindow: tokens })
                }}
              >
                <option value="">{t('capacityPresetCustom')}</option>
                {CAPACITY_PRESETS.map(preset => (
                  <option key={preset.tokens} value={String(preset.tokens)}>{t(preset.label)}</option>
                ))}
              </select>
            </label>
            {(['contextWindow', 'maxTokens'] as const).map(field => (
              <label className={styles['modelField']} key={field}>
                <span className={styles['modelFieldLabel']}>{t(field)}</span>
                <input
                  className={styles['input']}
                  type="text"
                  inputMode="numeric"
                  value={props[field].value}
                  placeholder={props[field].placeholder}
                  aria-label={`${t(field)} ${String(position)}`}
                  disabled={disabled}
                  onChange={(event) => { props[field].onChange(event.target.value) }}
                  onBlur={props[field].onBlur}
                />
              </label>
            ))}
            {props.reasoning === undefined
              ? null
              : (
                <label className={styles['modelField']}>
                  <span className={styles['modelFieldLabel']}>{t('reasoningLevel')}</span>
                  <select
                    className={`${styles['input']} ${styles['selectInput']}`}
                    value={props.reasoning.value}
                    aria-label={`${t('reasoningLevel')} ${String(position)}`}
                    disabled={disabled}
                    onChange={(event) => { props.reasoning?.onChange(event.target.value as ReasoningPreset) }}
                  >
                    <option value="inherit">{t('reasoningInherit')}</option>
                    <option value="unsupported">{t('reasoningUnsupported')}</option>
                    <option value="low">{t('reasoningLow')}</option>
                    <option value="high">{t('reasoningHigh')}</option>
                    <option value="max">{t('reasoningMax')}</option>
                    <option value="all">{t('reasoningAll')}</option>
                    {props.reasoning.value === 'custom'
                      ? <option value="custom">{t('reasoningCustom')}</option>
                      : null}
                  </select>
                </label>
              )}
            <ModelInputTypes
              model={model} field={props.inputField} position={position}
              fallback={props.inputFallback} disabled={disabled || props.inputLoading === true} t={t} onChange={props.onChange}
            />
          </div>
        )
        : null}
    </div>
  )
}
