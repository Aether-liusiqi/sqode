import type { TurnBoundaryProjection } from './types.ts'
import type {} from '@liusiqi-dev/dsh-session-projection'

declare module '@liusiqi-dev/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** The agent session's open/last turn and step boundary facts (whole value). */
    turnBoundary: TurnBoundaryProjection
  }
}

export {}
