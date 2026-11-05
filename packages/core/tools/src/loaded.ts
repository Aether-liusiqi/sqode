/**
 * The tools a session has explicitly loaded, as a fold over its event log.
 *
 * A request declares only what its window can carry, so a tool the model asked for
 * by name has to be remembered somewhere that survives: compaction resets the
 * declaration series, and resume rebuilds state by replaying events. Keeping this
 * in memory alone was the one way the loaded set could vanish exactly when it
 * mattered.
 *
 * @module @liusiqi-dev/dsh-tools/loaded
 */

// The specifier must be the `/types` subpath: that is the module the vocabulary
// interface is declared in, and the persistence catalog scanner only collects
// merges that name it. Augmenting the package root compiles, but the event never
// reaches `KNOWN_SESSION_EVENT_TYPES`, and a log containing it would then be
// refused by its own reader.
declare module '@liusiqi-dev/dsh-session/types' {
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
 * Move one name to the end of the load order.
 *
 * A repeat load has to change the order, not just the membership: the declaration
 * budget keeps the most recent names, so this is how a tool that later loads
 * squeezed out regains a place.
 * @param state - the current order.
 * @param name - the tool just loaded.
 * @returns the next order.
 */
export function promoteLoadedTool(state: readonly string[], name: string): string[] {
  return [...state.filter(existing => existing !== name), name]
}

/**
 * Fold `tools/loaded` events into the load order.
 *
 * The projection owns this in production; the fold is kept pure so the projection's
 * `apply` and the unit tests share one implementation.
 * @param events - the session's events, in order.
 * @returns the loaded tool names, oldest load first.
 */
export function loadedToolOrder(events: readonly LoadedEvent[]): string[] {
  return events.reduce<string[]>((state, event) => {
    if (event.type !== 'tools/loaded') return state
    const data = event.data
    if (data === null || typeof data !== 'object') return state
    const name = (data as { toolName?: unknown }).toolName
    if (typeof name !== 'string' || name.length === 0) return state
    return promoteLoadedTool(state, name)
  }, [])
}

/**
 * Names of every tool the session has loaded so far, without their order.
 *
 * Monotonic by design: a loaded tool is never dropped because a later message did
 * not mention it again, which would make the declared set flap and restart the
 * provider's request series. Being squeezed out of one request's budget does not
 * remove it here — a later mention brings it back.
 * @param events - the session's events, in order.
 * @returns the loaded tool names.
 */
export function loadedTools(events: readonly LoadedEvent[]): ReadonlySet<string> {
  return new Set(loadedToolOrder(events))
}
