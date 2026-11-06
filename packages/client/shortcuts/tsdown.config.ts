import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/sqh-client-shortcuts',
  ['lib/types/index.js', 'lib/types/protocol.js'],
  { hostPhase: true },
)
