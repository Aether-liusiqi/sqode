import { Session, SessionSeq } from '@liusiqi-dev/sqh-session'

export function reads(session: Session): void {
  session.snapshotEvents()
  session.eventAt(SessionSeq(0))
  session.ownEvents()
}

/** @deprecated Use the replacement API. */
function oldApi(): void {}

export function unrelatedRead(): void {
  oldApi()
}
