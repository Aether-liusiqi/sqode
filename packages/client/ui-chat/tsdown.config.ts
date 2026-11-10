import { clientBundle } from '../tsdown.client.ts'

const bundle = clientBundle('@liusiqi-dev/sqh-client-ui-chat', ['lib/types/index.js'])

export default bundle satisfies typeof bundle
