/** Static Browser tab type and guide declaration. */
import type { ShortcutCommandId } from '@liusiqi-dev/sqh-client-shortcuts/client'
import type { TranslateNS } from '@liusiqi-dev/sqh-client-locale/client'
import { GuideArtworkBrowser } from '@liusiqi-dev/sqh-client-ui-primitives'
import type { SidebarRightTabDefinition } from '@liusiqi-dev/sqh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** Browser tab kind. */
export const BROWSER_KIND = 'browser'

/** Browser implementation identity and keyed Slot dispatch key. */
export const BROWSER_ID = '@liusiqi-dev/sqh-client-ui-sidebar-browser'

/** Build the Browser type with locale-live copy. */
export function browserDefinition(t: TranslateNS<'sidebarBrowser'>): SidebarRightTabDefinition {
  return {
    id: BROWSER_ID,
    kind: BROWSER_KIND,
    multiple: true,
    priority: 'builtin',
    title: () => t('type.label'),
    guide: [{
      id: 'new', commandId: 'browser.new' as ShortcutCommandId, order: 30, title: () => t('guide.title'),
      description: () => t('guide.description'), icon: GuideArtworkBrowser,
    }],
  }
}
