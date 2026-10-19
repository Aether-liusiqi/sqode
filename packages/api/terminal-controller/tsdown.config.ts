import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/dsh-api-terminal-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
