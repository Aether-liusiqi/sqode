/** One install entry for plugins, Skills and MCP servers, backed by the inventory. */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ExtensionInstallError, installExtension, uninstallExtension } from '../src/extension-installer.ts'
import { listExtensions } from '../src/extension-registry.ts'

const SKILL = `---
name: sm-research
description: Research workflow
---
# Skill
`

async function home() {
  const dir = await mkdtemp(join(tmpdir(), 'sqh-ext-install-'))
  return { dir, cleanup: async () => rm(dir, { recursive: true, force: true }) }
}

describe('installExtension', () => {
  it('installs a Skill into SQODE_HOME/skills and registers it', async () => {
    const h = await home()
    try {
      const result = await installExtension('skill', 'sm-research', { home: h.dir, source: 'github:acme/sm-research', contents: SKILL })
      expect(result).toMatchObject({ kind: 'skill', name: 'sm-research', action: 'installed' })
      expect(await readFile(result.location, 'utf8')).toBe(SKILL)
      expect(result.location).toContain(join(h.dir, 'skills', 'sm-research'))
      expect(await listExtensions(h.dir)).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('refuses a second install unless update was requested', async () => {
    const h = await home()
    try {
      await installExtension('skill', 'sm-research', { home: h.dir, source: 'gh:a', contents: SKILL })
      const again = await installExtension('skill', 'sm-research', { home: h.dir, source: 'gh:b', contents: SKILL })
      expect(again.action).toBe('already-installed')
      expect(await readFile(again.location, 'utf8')).toBe(SKILL)
      const updated = await installExtension('skill', 'sm-research', { home: h.dir, source: 'gh:b', contents: `${SKILL}v2`, update: true })
      expect(updated.action).toBe('updated')
      expect(await readFile(updated.location, 'utf8')).toContain('v2')
      expect(await listExtensions(h.dir)).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('installs an MCP server into the profile patch and registers it', async () => {
    const h = await home()
    try {
      const patch = join(h.dir, 'profiles', 'desktop', 'cordis.patch.yml')
      await mkdir(join(h.dir, 'profiles', 'desktop'), { recursive: true })
      await writeFile(patch, '# keep me\n- id: ui-theme\n  config:\n    preference: dark\n')
      const result = await installExtension('mcp', 'docs', {
        home: h.dir, source: 'github:acme/docs-mcp',
        config: { transport: 'stdio', command: 'docs-mcp', args: ['serve'] },
      })
      expect(result).toMatchObject({ kind: 'mcp', name: 'docs', action: 'installed' })
      const text = await readFile(patch, 'utf8')
      expect(text).toContain('# keep me')
      expect(text).toContain('mcp-docs')
      expect(text).toContain('@liusiqi-dev/sqh-mcp-client')
    } finally {
      await h.cleanup()
    }
  })

  it('delegates plugin installs and still records them', async () => {
    const h = await home()
    try {
      const installPlugin = vi.fn(async () => ({ location: '~/.sqode/profiles/desktop/package.json', revision: '1.2.3' }))
      const result = await installExtension('plugin', 'sqh-demo', { home: h.dir, source: 'sqh-demo', installPlugin })
      expect(installPlugin).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ kind: 'plugin', name: 'sqh-demo', action: 'installed' })
      expect(await listExtensions(h.dir, 'plugin')).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('refuses invalid names and missing content before writing anything', async () => {
    const h = await home()
    try {
      await expect(installExtension('skill', 'Bad_Name', { home: h.dir, source: 'x' })).rejects.toThrow(ExtensionInstallError)
      await expect(installExtension('skill', 'good', { home: h.dir, source: 'x' })).rejects.toThrow(ExtensionInstallError)
      await expect(installExtension('mcp', 'bad name!', { home: h.dir, source: 'x' })).rejects.toThrow(ExtensionInstallError)
      await expect(installExtension('mcp', 'good', { home: h.dir, source: 'x' })).rejects.toThrow(ExtensionInstallError)
      expect(await listExtensions(h.dir)).toEqual([])
    } finally {
      await h.cleanup()
    }
  })

  it('uninstalls only the exact recorded path and row', async () => {
    const h = await home()
    try {
      const result = await installExtension('skill', 'sm-research', { home: h.dir, source: 'x', contents: SKILL })
      expect(existsSync(result.location)).toBe(true)
      expect(await uninstallExtension(h.dir, 'skill', 'sm-research')).toBe(true)
      expect(existsSync(result.location)).toBe(false)
      expect(await listExtensions(h.dir)).toEqual([])
      expect(await uninstallExtension(h.dir, 'skill', 'sm-research')).toBe(false)
    } finally {
      await h.cleanup()
    }
  })
})
