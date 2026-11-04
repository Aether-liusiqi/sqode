/**
 * The tools a session has explicitly loaded, folded from its event log.
 *
 * A request declares only what its window can carry, so a tool the model asked for
 * by name has to be remembered somewhere that survives: compaction resets the
 * declaration series, and resume rebuilds state by replaying events. Keeping this
 * in memory alone was the one way the loaded set could vanish exactly when it
 * mattered.
 *
 * @module @liusiqi-dev/dsh-tools/loaded
 */

declare module '@liusiqi-dev/dsh-session' {
  interface SessionEventMap {
    /** One tool the model asked to load, recorded so the next request declares it. */
    'tools/loaded': { readonly toolName: string }
  }
}

/** The event shape this fold reads, kept structural so no session type is required. */
interface LoadedEvent {
  readonly type: string
  readonly data?: unknown
}

/**
 * Names of every tool the session has loaded so far.
 *
 * Monotonic by design: a loaded tool is never dropped because a later message did
 * not mention it again, which would make the declared set flap and restart the
 * provider's request series.
 * @param events - the session's events, in order.
 * @returns the loaded tool names.
 */
export function loadedTools(events: readonly LoadedEvent[]): ReadonlySet<string> {
  const loaded = new Set<string>()
  for (const event of events) {
    if (event.type !== 'tools/loaded') continue
    const data = event.data
    if (data === null || typeof data !== 'object') continue
    const name = (data as { toolName?: unknown }).toolName
    if (typeof name === 'string' && name.length > 0) loaded.add(name)
  }
  return loaded
}
