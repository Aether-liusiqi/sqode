import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@liusiqi-dev/dsh-client-web',
  ['lib/types/index.js', 'lib/types/apply-injections.js'],
)
