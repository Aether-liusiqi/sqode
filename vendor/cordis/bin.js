#!/usr/bin/env node

import { Context } from '@liusiqi-dev/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@liusiqi-dev/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@liusiqi-dev/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
