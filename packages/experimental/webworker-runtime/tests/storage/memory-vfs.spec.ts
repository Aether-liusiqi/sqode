/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `sqh-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/one.txt', 'one')
    vfs.seed('/sqh/two.txt', 'two')
    const first = identity(vfs, '/sqh/one.txt')
    expect(identity(vfs, '/sqh/two.txt')).not.toBe(first)
    expect(identity(vfs, '/sqh/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/sqh/skills/git/SKILL.md')
    vfs.rmSync('/sqh/skills', { recursive: true })
    vfs.seed('/sqh/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/sqh/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/from.txt', 'moved')
    vfs.seed('/sqh/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/sqh/from.txt'), identity(vfs, '/sqh/to.txt')]
    vfs.renameSync('/sqh/from.txt', '/sqh/to.txt')
    const renamed = identity(vfs, '/sqh/to.txt')
    expect(vfs.readFileSync('/sqh/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/sqh/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/sqh/restored') as VfsStats
    const directory = vfs.statSync('/sqh/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/sqh/log.jsonl')
    vfs.writeFileSync('/sqh/log.jsonl', 'second\n')
    const written = modified(vfs, '/sqh/log.jsonl')
    vfs.appendFileSync('/sqh/log.jsonl', 'third\n')
    const appended = modified(vfs, '/sqh/log.jsonl')
    vfs.truncateSync('/sqh/log.jsonl', 6)
    const truncated = modified(vfs, '/sqh/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/sqh/log.jsonl', 'second\n')
    expect(modified(vfs, '/sqh/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/sqh/file', 5)
    expect([...vfs.readFileSync('/sqh/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/sqh/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/sqh/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/sqh/workspace')
    const empty = modified(vfs, '/sqh/workspace')
    vfs.writeFileSync('/sqh/workspace/file.txt', 'one')
    const created = modified(vfs, '/sqh/workspace')
    vfs.writeFileSync('/sqh/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/sqh/workspace')
    vfs.rmSync('/sqh/workspace/file.txt')
    const removed = modified(vfs, '/sqh/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/sqh/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/sqh/seeded.txt', 'changed')
    vfs.mkdirSync('/sqh/created')
    vfs.chmodSync('/sqh/created', 0o700)
    vfs.renameSync('/sqh/seeded.txt', '/sqh/renamed.txt')
    vfs.rmSync('/sqh/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/sqh/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/sqh/created' },
      { kind: 'chmod', path: '/sqh/created', mode: 0o700 },
      { kind: 'remove', path: '/sqh/seeded.txt' },
      { kind: 'write', path: '/sqh/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/sqh/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/sqh')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/sqh/one', '1')
    first()
    second()
    vfs.writeFileSync('/sqh/two', '2')
    expect(seen).toEqual(['/sqh/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/sqh')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/sqh/log', 'a')
    vfs.appendFileSync('/sqh/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/sqh/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/sqh/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/source', 'old')
    const descriptor = vfs.openFileSync('/sqh/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/sqh/source', '/sqh/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/sqh/destination'])
    expect(vfs.readFileSync('/sqh/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/sqh/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('reports the path identity through a BigInt file handle stat', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/session.lock', '')
    const handle = vfs.open('/sqh/session.lock', 'w')
    const held = await handle.stat({ bigint: true }) as VfsBigIntStats
    const current = vfs.statSync('/sqh/session.lock', { bigint: true }) as VfsBigIntStats

    expect([held.dev, held.ino]).toEqual([current.dev, current.ino])
    await handle.chmod(0o600)
    expect((vfs.statSync('/sqh/session.lock') as VfsStats).mode & 0o777).toBe(0o600)
    await handle.close()
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/sqh/staging/nested', { mode: 0o700 })
    vfs.seed('/sqh/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/sqh/staging', '/sqh/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/sqh/staging'],
      ['mkdir', '/sqh/published'],
      ['mkdir', '/sqh/published/nested'],
      ['write', '/sqh/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/source/nested/file', 'source')
    vfs.seed('/sqh/file', 'destination')
    vfs.seed('/sqh/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/sqh/source', '/sqh/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/sqh/source', '/sqh/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/sqh/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/sqh/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/sqh/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/sqh/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/sqh/source/nested', { mode: 0o700 })
    vfs.seed('/sqh/source/nested/file', 'source')
    vfs.seedDirectory('/sqh/destination', { mode: 0o711 })

    vfs.renameSync('/sqh/source', '/sqh/destination')

    expect(vfs.existsSync('/sqh/source')).toBe(false)
    expect(vfs.readFileSync('/sqh/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/sqh/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/sqh/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/session.jsonl', 'committed\n')
    vfs.linkSync('/sqh/session.jsonl', '/sqh/session-latest.jsonl')
    vfs.linkSync('/sqh/session-latest.jsonl', '/sqh/session-archive.jsonl')
    expect(identity(vfs, '/sqh/session-latest.jsonl')).toBe(identity(vfs, '/sqh/session.jsonl'))
    expect(linkCount(vfs, '/sqh/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/sqh/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/sqh/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/sqh/session.jsonl',
      '/sqh/session-latest.jsonl',
      '/sqh/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/sqh/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/sqh/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/sqh/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/sqh/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/sqh/session-latest.jsonl')
    expect(linkCount(vfs, '/sqh/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/sqh/session-archive.jsonl')
    expect(linkCount(vfs, '/sqh/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/sqh/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/source', 'value')
    vfs.linkSync('/sqh/source', '/sqh/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/sqh/source', '/sqh/alias')

    expect(vfs.readFileSync('/sqh/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/sqh/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/sqh/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/replacement', 'replacement')
    vfs.seed('/sqh/target', 'old')
    vfs.linkSync('/sqh/target', '/sqh/target-alias')
    const replaced = vfs.openFileSync('/sqh/target', 'r+')
    vfs.renameSync('/sqh/replacement', '/sqh/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/sqh/target-alias'])
    expect(vfs.readFileSync('/sqh/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/sqh/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/sqh/target-alias')).toBe(1n)

    vfs.seed('/sqh/tree/file', 'tree')
    vfs.linkSync('/sqh/tree/file', '/sqh/outside')
    const moved = vfs.openFileSync('/sqh/tree/file', 'r+')
    vfs.renameSync('/sqh/tree', '/sqh/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/sqh/outside', '/sqh/moved/file'])
    expect(linkCount(vfs, '/sqh/moved/file')).toBe(2n)

    vfs.rmSync('/sqh/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/sqh/outside'])
    expect(vfs.readFileSync('/sqh/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/sqh/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/sqh/file', 'value')
    vfs.seedDirectory('/sqh/directory')
    expect(() => { vfs.renameSync('/sqh/file', '/sqh/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/sqh/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/sqh/directory').isDirectory()).toBe(true)
  })
})
