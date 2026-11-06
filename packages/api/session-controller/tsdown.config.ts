import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/sqh-api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
