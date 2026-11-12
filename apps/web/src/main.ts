/** Browser entry for the Web client. */
import '@liusiqi-dev/sqh-client-ui-theme/brand-font.css'
import { AppWebEntry, applyIndexInjections } from '@liusiqi-dev/sqh-client-web'

interface DesktopBootGlobal {
  sqhDesktopBoot?: {
    failed(message: string): Promise<void>
    ready(): Promise<{ injections: Parameters<typeof applyIndexInjections>[0]; streamBaseUrl: string }>
  }
}
const desktop = (globalThis as DesktopBootGlobal).sqhDesktopBoot
const reportFailure = (reason: unknown): void => {
  if (desktop === undefined) throw reason
  void desktop.failed(reason instanceof Error ? reason.message : String(reason)).catch(console.error)
}

try {
  const el = document.getElementById('root')
  if (el === null) throw new Error('web app: missing #root')
  const entry = new AppWebEntry(el)
  // Fade out the CSS splash once React has mounted into #root.
  const splash = document.getElementById('sqh-splash')
  if (splash !== null) {
    requestAnimationFrame(() => {
      splash.classList.add('sqh-done')
      splash.addEventListener('transitionend', () => { splash.remove() }, { once: true })
    })
  }
  if (desktop !== undefined) {
    const gate = (globalThis as { __SQH_BOOT_READY__?: PromiseWithResolvers<void> }).__SQH_BOOT_READY__
    if (gate === undefined) throw new Error('desktop web: boot readiness is missing')
    void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
      const transport = globalThis as { __SQH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
      transport.__SQH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }
      await applyIndexInjections(injections, src => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => { resolve() }
        script.onerror = () => { reject(new Error(`desktop web: failed to load ${src}`)) }
        document.head.append(script)
      }))
      gate.resolve()
    }).catch((error: unknown) => { gate.reject(error) })
  }
  void entry.run(desktop === undefined ? undefined : reportFailure)
} catch (reason) {
  reportFailure(reason)
}
