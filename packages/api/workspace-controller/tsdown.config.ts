import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/dsh-api-workspace-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
