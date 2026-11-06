/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@liusiqi-dev/sqh-client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'
import type { DesktopBrowserBridge } from '@liusiqi-dev/sqh-client-ui-sidebar-browser/types'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  shortcutsInput: 'sqh-desktop:shortcuts-input',
  shortcutsCloseWindow: 'sqh-desktop:shortcuts-close-window',
  shortcutsGet: 'sqh-desktop:shortcuts-get',
  shortcutsEdit: 'sqh-desktop:shortcuts-edit',
  shortcutsChanged: 'sqh-desktop:shortcuts-changed',
  shortcutsRecording: 'sqh-desktop:shortcuts-recording',
  boot: 'sqh-desktop:boot',
  enterWorkspace: 'sqh-desktop:enter-workspace',
  onboardingActive: 'sqh-desktop:onboarding-active',
  onboardingApiKey: 'sqh-desktop:onboarding-api-key',
  bootFailed: 'sqh-desktop:boot-failed',
  browserAcquire: 'sqh-desktop:browser-acquire',
  browserRelease: 'sqh-desktop:browser-release',
  browserOpenRequested: 'sqh-desktop:browser-open-requested',
  directoryPick: 'sqh-desktop:directory-pick',
  deviceInfo: 'sqh-desktop:device-info',
  feedbackSave: 'sqh-desktop:feedback-save',
  localeBootstrap: 'sqh-desktop:locale-bootstrap',
  localeChanged: 'sqh-desktop:locale-changed',
  updatesStatus: 'sqh-desktop:updates-status',
  updatesOpen: 'sqh-desktop:updates-open',
  updatesPresentation: 'sqh-desktop:updates-presentation',
  nativeThemeSet: 'sqh-desktop:native-theme-set',
  windowFullscreen: 'sqh-desktop:window-fullscreen',
  windowsAppearance: 'sqh-desktop:windows-appearance',
  windowsMenu: 'sqh-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
}

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** What the interface sends when the user submits the feedback form. */
export interface DesktopFeedbackReport {
  /** Chosen quick topics; identifiers, not translated labels. */
  readonly topics: readonly string[]
  /** The user's own words, may be empty when only topics were ticked. */
  readonly details: string
  /** Application version at submission, when the document knows it. */
  readonly version?: string
  /** Interface language at submission. */
  readonly locale?: string
}

/** Where a saved report landed, so the interface can say so. */
export interface DesktopFeedbackSaved {
  readonly path: string
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface SqhDesktopProductApi {
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  /**
   * Persist one feedback report under the local data directory.
   *
   * The report never leaves the machine: the desktop shell writes it to disk and
   * returns the path so the interface can tell the user where it went.
   */
  readonly feedback: {
    save(report: DesktopFeedbackReport): Promise<DesktopFeedbackSaved>
  }
  readonly updates: {
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
}

/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'sqh-app'

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('dsh desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error('dsh desktop: rejected IPC from an unowned renderer')
  }
}
