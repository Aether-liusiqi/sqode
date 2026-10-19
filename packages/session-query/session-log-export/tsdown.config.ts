import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/dsh-session-log-export',
  ['lib/types/index.js'],
  { hostPhase: true },
)
