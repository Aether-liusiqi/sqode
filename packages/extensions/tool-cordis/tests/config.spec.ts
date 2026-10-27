import type { Context } from '@liusiqi-dev/cordis'
import { describe, expect, it } from 'vitest'
import { queryLiveConfig } from '../src/config.ts'

/** One Loader entry, reduced to the fields the directory reads. */
function entry(id: string, name: string, options: { disabled?: boolean; fiber?: unknown } = {}): never {
  return {
    id,
    options: { id, name },
    disabled: options.disabled ?? false,
    fiber: options.fiber,
  } as never
}

/** A context whose only Loader returns the supplied entries. */
function context(entries: readonly unknown[]): Context {
  const loader = { entries: () => entries, resolve: () => entries[0] }
  return { get: (key: string) => key === 'loader' ? loader : undefined } as unknown as Context
}

describe('Config.listConfigs', () => {
  it('reports why an entry is not running instead of folding it into inactive', async () => {
    // A reader asking "is this plugin enabled" previously saw `inactive` for all three
    // cases and went looking in the config files, where a line-based reading of YAML
    // attributes a neighbouring entry's `disabled: true` to the wrong plugin.
    const result = await queryLiveConfig(context([
      entry('off', '@scope/off', { disabled: true }),
      entry('unloaded', '@scope/unloaded'),
      entry('disposed', '@scope/disposed', { fiber: { uid: null } }),
      entry('running', '@scope/running', { fiber: { uid: 1, runtime: {} } }),
    ]), {})

    expect(result).toMatchObject({
      entries: [
        { id: 'off', status: 'inactive', state: 'disabled' },
        { id: 'unloaded', status: 'inactive', state: 'not-loaded' },
        { id: 'disposed', status: 'inactive', state: 'disposed' },
        { id: 'running', status: 'absent', state: 'active' },
      ],
      total: 4,
      nextOffset: null,
    })
  })

  it('filters by plugin name so one entry can be asked about directly', async () => {
    const result = await queryLiveConfig(context([
      entry('a', '@scope/target', { disabled: true }),
      entry('b', '@scope/other'),
    ]), { name: '@scope/target' })

    expect(result).toMatchObject({ entries: [{ id: 'a', state: 'disabled' }], total: 1 })
  })

  it('refuses a serialized query instead of quietly returning the default page', async () => {
    // Reading a non-object as "no query" is what made dropped filters look like a
    // provider that ignores its parameters.
    await expect(queryLiveConfig(context([entry('a', '@scope/a')]), '{"name":"@scope/a"}'))
      .rejects.toThrow(/Config query input must be an object, received string/)
  })
})
