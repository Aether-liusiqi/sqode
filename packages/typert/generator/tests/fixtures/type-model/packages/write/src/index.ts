import { Service } from '@liusiqi-dev/cordis'

/** Service whose public annotations are intentionally absent. */
export class WritableService extends Service {
  value = 1

  echo(input = 'value') {
    return input
  }
}

declare module '@liusiqi-dev/cordis' {
  interface Context {
    writable: WritableService
  }
}

export default WritableService
