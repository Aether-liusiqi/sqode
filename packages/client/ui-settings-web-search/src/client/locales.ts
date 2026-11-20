/** Locale bundles for the web-search provider's settings page. */

import type { SettingsFormLabels } from '@liusiqi-dev/sqh-client-ui-primitives'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint' | 'scope' | 'scopeHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidText'

/** English copy. */
export const en: Record<WebSearchSettingsLocaleKey, string> = {
  title: 'Web search',
  description: 'Web search uses Metaso, which needs an API key. The fields below configure that provider.',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file under METASO_API_KEY. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured. Set one here or export METASO_API_KEY before searching.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'Leave blank to use the Metaso default address.',
  scope: 'Retrieval scope',
  scopeHint: 'Metaso retrieval scope. Leave blank to use the provider default.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidText: 'Enter text, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<WebSearchSettingsLocaleKey, string> = {
  title: '网页搜索',
  description: '网页搜索使用 Metaso，需要 API Key。下方字段用于配置该服务。',
  apiKey: 'API Key',
  apiKeyHint: '以 METASO_API_KEY 为引用存入凭证域，不写入设置文件；留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥。请先在此设置或导出 METASO_API_KEY，再使用搜索。',
  baseUrl: '接口地址',
  baseUrlHint: '留空则使用 Metaso 默认地址。',
  scope: '检索范围',
  scopeHint: 'Metaso 检索范围；留空则使用服务默认值。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidText: '请填写文本；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
