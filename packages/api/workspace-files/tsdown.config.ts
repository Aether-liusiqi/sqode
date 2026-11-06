import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/sqh-api-workspace-files',
  ['lib/types/index.js'],
  { hostPhase: true },
)
