import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@liusiqi-dev/sqh-api-job-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
