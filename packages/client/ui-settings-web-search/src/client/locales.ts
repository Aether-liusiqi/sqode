/** Locale bundles for the web-search provider's settings page. */

import type { SettingsFormLabels } from '@liusiqi-dev/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint' | 'maxUses' | 'maxUsesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<WebSearchSettingsLocaleKey, string> = {
  title: 'Web search',
  description: 'Search uses a keyless engine route by default; the fields below apply only to an API-backed route.',
  apiKey: 'API key',
  apiKeyHint: 'Only the API-backed route needs it. Stored outside the settings file; leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured. The default route needs none, so search already works.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'Only the API-backed route uses it. Leave blank to use that route\'s default address.',
  maxUses: 'Max searches per request',
  maxUsesHint: 'Cap on searches per request when the API-backed route is used. The default route applies its own pacing.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<WebSearchSettingsLocaleKey, string> = {
  title: '网页搜索',
  description: '默认使用无需密钥的搜索引擎检索；下方字段仅在切换到 API 通道时生效。',
  apiKey: 'API Key',
  apiKeyHint: '仅 API 通道需要。不写入设置文件；留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥。默认检索不需要密钥，可以直接使用。',
  baseUrl: '接口地址',
  baseUrlHint: '仅 API 通道使用；留空则使用该通道的默认地址。',
  maxUses: '单次请求最多搜索次数',
  maxUsesHint: '使用 API 通道时，一次请求在必须作答前最多可搜索的次数。默认检索按自身的频率节流。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
