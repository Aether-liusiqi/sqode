import type { AccountView, SignInAttemptId } from '@liusiqi-dev/sqh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type WelcomeApi, type WelcomeNotice, type WelcomeSaveResult } from './welcome-api.ts'

const prefix = '--sqh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
/**
 * The welcome renderer is a standalone BrowserWindow with its own stylesheet.
 * Project the native theme source onto the same body attribute the main window
 * uses, so a manual light/dark choice is honoured here too. `system` resolves
 * through matchMedia; a missing preload argument falls back to system.
 */
const themePrefix = '--sqh-welcome-theme='
const themeSource = process.argv.find(argument => argument.startsWith(themePrefix))?.slice(themePrefix.length) ?? 'system'
const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
const welcomeDark = themeSource === 'dark' || (themeSource === 'system' && systemDark)
const applyWelcomeTheme = (): void => {
  if (welcomeDark) document.body.setAttribute('data-ds-dark-theme', '')
  else document.body.removeAttribute('data-ds-dark-theme')
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', applyWelcomeTheme, { once: true })
else applyWelcomeTheme()

const api: WelcomeApi = {
  ...resolveDesktopLocale(locale),
  takeNotice: () => ipcRenderer.invoke(WELCOME_IPC.takeNotice) as Promise<WelcomeNotice | undefined>,
  startSignIn: () => ipcRenderer.invoke(WELCOME_IPC.start) as Promise<AccountView>,
  cancelSignIn: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.cancel, id) as Promise<AccountView>,
  copySignInLink: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.copyLink, id) as Promise<void>,
  onAccountState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: AccountView): void =>{  listener(state) }
    ipcRenderer.on(WELCOME_IPC.state, receive)
    return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive) }
  },
  saveApiKey: (value: string) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value) as Promise<WelcomeSaveResult>,
  skip: () => ipcRenderer.invoke(WELCOME_IPC.skip) as Promise<void>,
}
contextBridge.exposeInMainWorld('sqhWelcome', api)
