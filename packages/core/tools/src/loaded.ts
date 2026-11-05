/**
 * The load order of tools a session asked for, as one pure step.
 *
 * A request declares only what its window can carry, so a tool the model asked for
 * by name has to be remembered somewhere that survives: compaction resets the
 * declaration series, and resume rebuilds state by replaying events. The session
 * projection `toolsLoaded` holds that order; this module owns the single step it
 * folds with, so the projection's `apply` and the tests share one implementation.
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

/** The event shape this step reads, kept structural so no session type is required. */
export interface LoadedEvent {
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
 * The name one `tools/loaded` event contributes, if any.
 *
 * Malformed payloads are skipped rather than thrown: a log written by another build
 * may carry fields this one does not expect.
 * @param event - one committed session event.
 * @returns the tool name, or `undefined` when the event is not a load.
 */
export function loadedToolName(event: LoadedEvent): string | undefined {
  if (event.type !== 'tools/loaded') return undefined
  const data = event.data
  if (data === null || typeof data !== 'object') return undefined
  const name = (data as { toolName?: unknown }).toolName
  return typeof name === 'string' && name.length > 0 ? name : undefined
}
