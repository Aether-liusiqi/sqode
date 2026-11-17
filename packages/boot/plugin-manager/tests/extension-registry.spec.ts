/** The shared inventory only knows what Sqode itself installed. */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXTENSION_REGISTRY_FILENAME, findExtension, listExtensions, registerExtension, unregisterExtension,
} from '../src/extension-registry.ts'

async function home() {
  const dir = await mkdtemp(join(tmpdir(), 'sqh-extensions-'))
  return { dir, cleanup: async () => rm(dir, { recursive: true, force: true }) }
}

const skill = {
  kind: 'skill' as const, name: 'sm-research', source: 'https://github.com/Aether-liusiqi/sm-research',
  location: '~/.sqode/skills/sm-research/SKILL.md',
}

describe('extension registry', () => {
  it('starts empty and registers one record persistently', async () => {
    const h = await home()
    try {
      expect(await listExtensions(h.dir)).toEqual([])
      const { record, replaced } = await registerExtension(h.dir, skill)
      expect(replaced).toBe(false)
      expect(record).toMatchObject({ ...skill, enabled: true })
      expect(typeof record.installedAt).toBe('string')
      const path = join(h.dir, EXTENSION_REGISTRY_FILENAME)
      expect(existsSync(path)).toBe(true)
      expect(await findExtension(h.dir, 'skill', 'sm-research')).toMatchObject(skill)
    } finally {
      await h.cleanup()
    }
  })

  it('updates a same-kind/same-name record instead of duplicating it', async () => {
    const h = await home()
    try {
      await registerExtension(h.dir, skill)
      const second = await registerExtension(h.dir, { ...skill, revision: 'abc123', source: 'https://github.com/other/sm-research' })
      expect(second.replaced).toBe(true)
      expect(await listExtensions(h.dir)).toHaveLength(1)
      expect(await findExtension(h.dir, 'skill', 'sm-research')).toMatchObject({ revision: 'abc123', source: 'https://github.com/other/sm-research' })
    } finally {
      await h.cleanup()
    }
  })

  it('keeps same names in different kinds separate', async () => {
    const h = await home()
    try {
      await registerExtension(h.dir, skill)
      await registerExtension(h.dir, { ...skill, kind: 'mcp', location: '~/.sqode/profiles/desktop/cordis.patch.yml' })
      expect(await listExtensions(h.dir)).toHaveLength(2)
      expect(await listExtensions(h.dir, 'mcp')).toHaveLength(1)
      expect(await listExtensions(h.dir, 'plugin')).toHaveLength(0)
    } finally {
      await h.cleanup()
    }
  })

  it('unregisters precisely and ignores unknown names', async () => {
    const h = await home()
    try {
      await registerExtension(h.dir, skill)
      await registerExtension(h.dir, { kind: 'plugin', name: 'sqh-demo', source: 'sqh-demo', location: '~/.sqode/profiles/desktop/package.json' })
      expect(await unregisterExtension(h.dir, 'skill', 'sm-research')).toBe(true)
      expect(await unregisterExtension(h.dir, 'skill', 'sm-research')).toBe(false)
      expect(await listExtensions(h.dir).then(rows => rows.map(row => row.name))).toEqual(['sqh-demo'])
    } finally {
      await h.cleanup()
    }
  })

  it('treats a corrupt or foreign registry as empty without throwing', async () => {
    const h = await home()
    try {
      await writeFile(join(h.dir, EXTENSION_REGISTRY_FILENAME), '{ not json')
      expect(await listExtensions(h.dir)).toEqual([])
      await writeFile(join(h.dir, EXTENSION_REGISTRY_FILENAME), JSON.stringify({ version: 2, extensions: [skill] }))
      expect(await listExtensions(h.dir)).toEqual([])
      const valid = { ...skill, enabled: true, installedAt: '2026-11-17T00:00:00.000Z' }
      await writeFile(join(h.dir, EXTENSION_REGISTRY_FILENAME), JSON.stringify({ version: 1, extensions: [valid, { kind: 'skill', name: 'broken' }] }))
      expect(await listExtensions(h.dir)).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('does not look into Claude Code skill directories', async () => {
    const h = await home()
    try {
      await mkdir(join(h.dir, '.claude', 'skills', 'sm-research'), { recursive: true })
      await writeFile(join(h.dir, '.claude', 'skills', 'sm-research', 'SKILL.md'), 'not Sqode’s')
      expect(await findExtension(h.dir, 'skill', 'sm-research')).toBeUndefined()
      expect(await readFile(join(h.dir, '.claude', 'skills', 'sm-research', 'SKILL.md'), 'utf8')).toBe('not Sqode’s')
    } finally {
      await h.cleanup()
    }
  })
})
