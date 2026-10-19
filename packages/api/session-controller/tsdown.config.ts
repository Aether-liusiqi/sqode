import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/dsh-api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
