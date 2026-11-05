import type { TurnBoundaryProjection } from './types.ts'
import type {} from '@liusiqi-dev/dsh-session-projection'

declare module '@liusiqi-dev/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** The agent session's open/last turn and step boundary facts (whole value). */
    turnBoundary: TurnBoundaryProjection
    /**
     * Tool names the session loaded, oldest load first.
     *
     * A repeat load moves the name to the end, which is how a tool squeezed out of
     * the declaration budget regains a place when the model asks for it again.
     */
    toolsLoaded: string[]
  }
}

export {}
