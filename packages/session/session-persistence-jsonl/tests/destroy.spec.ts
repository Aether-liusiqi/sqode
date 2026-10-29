/**
 * Removing a stored session: the whole directory goes in one step, the id stops
 * being observable, a repeat call reports nothing left, and a neighbouring
 * session is untouched. Nothing may survive under the root that the startup
 * scan would reject.
 */

import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@liusiqi-dev/cordis'
import { SESSION_FORMAT_VERSION, SessionId } from '@liusiqi-dev/dsh-session'
import type { SessionHeader } from '@liusiqi-dev/dsh-session'
import type { SessionPersistence } from '@liusiqi-dev/dsh-session-persistence'
import JsonlSessionPersistence from '../src/index.ts'

const roots: string[] = []

function meta(id: string): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 0,
    cwd: process.cwd(),
    isSeeded: false,
  }
}

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-jsonl-destroy-'))
  roots.push(root)
  return root
}

async function mount(root: string): Promise<SessionPersistence> {
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  return ctx.sessionPersistence
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('JsonlSessionPersistence: destroying a session', () => {
  it('removes the artifacts, hides the session, and reports the removal once', async () => {
    const root = await freshRoot()
    const backend = await mount(root)
    const handle = await backend.create(meta('doomed'))
    await handle.flush()
    await handle.close()

    await expect(backend.stat(SessionId('doomed'))).resolves.toBeDefined()

    await expect(backend.destroy(SessionId('doomed'))).resolves.toBe(true)
    await expect(backend.stat(SessionId('doomed'))).resolves.toBeUndefined()
    expect((await backend.list()).map(snapshot => snapshot.header.id)).not.toContain('doomed')

    // A second call has nothing left to remove; it must not throw.
    await expect(backend.destroy(SessionId('doomed'))).resolves.toBe(false)
  })

  it('leaves nothing under the root that a startup scan would reject', async () => {
    const root = await freshRoot()
    const backend = await mount(root)
    const handle = await backend.create(meta('scanned'))
    await handle.flush()
    await handle.close()

    await backend.destroy(SessionId('scanned'))

    for (const project of await readdir(root, { withFileTypes: true })) {
      if (!project.isDirectory()) continue
      const remaining = await readdir(join(root, project.name))
      expect(remaining).toEqual([])
    }
    await expect(backend.list()).resolves.toEqual([])
  })

  it('keeps a neighbouring session intact', async () => {
    const root = await freshRoot()
    const backend = await mount(root)
    const doomed = await backend.create(meta('left'))
    const kept = await backend.create(meta('right'))
    await doomed.flush()
    await kept.flush()
    await doomed.close()
    await kept.close()

    await backend.destroy(SessionId('left'))

    const surviving = await backend.stat(SessionId('right'))
    expect(surviving?.header.id).toBe('right')
    expect(existsSync(root)).toBe(true)
  })
})
