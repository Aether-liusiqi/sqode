/** Failed-install cleanup removes only newly created temporary directories. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanupNewTempDirs, pnpmTmpCandidates, profileLogRoot, resolvePnpmTmp, snapshotCleanupRoots } from '../src/install-cleanup.ts'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'sqh-cleanup-'))
  const logs = join(dir, 'logs')
  const pnpmTmp = join(dir, 'pnpm-tmp')
  await mkdir(logs)
  await mkdir(pnpmTmp)
  return { dir, logs, pnpmTmp, cleanup: async () => rm(dir, { recursive: true, force: true }) }
}

describe('snapshotCleanupRoots / cleanupNewTempDirs', () => {
  it('removes directories created after the snapshot and keeps earlier ones', async () => {
    const f = await fixture()
    try {
      await mkdir(join(f.logs, 'operation-old'))
      await writeFile(join(f.logs, 'keep.log'), 'old diagnostic')
      const snapshot = await snapshotCleanupRoots({ logs: f.logs, pnpmTmp: f.pnpmTmp })
      await mkdir(join(f.logs, 'operation-new'))
      await mkdir(join(f.pnpmTmp, '_tmp_new'))
      await writeFile(join(f.pnpmTmp, 'loose-file'), 'keep')

      const removed = await cleanupNewTempDirs(snapshot)

      expect(removed).toContain('operation-new')
      expect(removed).toContain('_tmp_new')
      expect(existsSync(join(f.logs, 'operation-old'))).toBe(true)
      expect(existsSync(join(f.logs, 'keep.log'))).toBe(true)
      expect(existsSync(join(f.logs, 'operation-new'))).toBe(false)
      expect(existsSync(join(f.pnpmTmp, '_tmp_new'))).toBe(false)
      expect(existsSync(join(f.pnpmTmp, 'loose-file'))).toBe(true)
    } finally {
      await f.cleanup()
    }
  })

  it('is a no-op when nothing new appeared', async () => {
    const f = await fixture()
    try {
      await mkdir(join(f.logs, 'operation-old'))
      const snapshot = await snapshotCleanupRoots({ logs: f.logs })
      expect(await cleanupNewTempDirs(snapshot)).toEqual([])
      expect(existsSync(join(f.logs, 'operation-old'))).toBe(true)
    } finally {
      await f.cleanup()
    }
  })

  it('skips roots that do not exist', async () => {
    const f = await fixture()
    try {
      const snapshot = await snapshotCleanupRoots({ logs: join(f.dir, 'missing'), pnpmTmp: join(f.dir, 'missing-too') })
      expect(await cleanupNewTempDirs(snapshot)).toEqual([])
    } finally {
      await f.cleanup()
    }
  })

  it('derives the profile diagnostics root', () => {
    expect(profileLogRoot(join('home', 'profiles', 'desktop'))).toBe(join('home', 'profiles', 'desktop', '.plugin-manager', 'logs'))
  })

  it('reads store-dir from the profile .npmrc and prefers an existing tmp root', async () => {
    const f = await fixture()
    try {
      const store = join(f.dir, 'custom-store')
      const tmp = join(store, 'v11', 'tmp')
      await mkdir(tmp, { recursive: true })
      await writeFile(join(f.dir, '.npmrc'), `store-dir=${store.replaceAll('\\', '/')}\n`)
      const candidates = pnpmTmpCandidates(f.dir, { XDG_DATA_HOME: join(f.dir, 'xdg') })
      expect(candidates[0]).toBe(tmp)
      expect(await resolvePnpmTmp(candidates)).toBe(tmp)
    } finally {
      await f.cleanup()
    }
  })

  it('returns undefined when no candidate store exists', async () => {
    const f = await fixture()
    try {
      expect(await resolvePnpmTmp(pnpmTmpCandidates(f.dir, { XDG_DATA_HOME: join(f.dir, 'missing') }))).toBeUndefined()
    } finally {
      await f.cleanup()
    }
  })
})
