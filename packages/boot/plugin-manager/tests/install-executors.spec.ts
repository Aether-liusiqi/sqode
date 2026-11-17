/** Skill and MCP executors place files where their loaders read them. */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installMcpServer, installSkill } from '../src/install-executors.ts'

const SKILL = `---
name: sm-research
description: Structured research workflow
---
# Skill
`

describe('installSkill', () => {
  it('writes SKILL.md under SQODE_HOME/skills/<name> and reports replacement', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sqh-skill-'))
    try {
      const first = await installSkill(home, 'sm-research', SKILL)
      expect(first).toMatchObject({ kind: 'skill', name: 'sm-research', replaced: false })
      expect(await readFile(first.path, 'utf8')).toBe(SKILL)
      expect(existsSync(join(home, 'skills', 'sm-research', 'SKILL.md'))).toBe(true)
      const second = await installSkill(home, 'sm-research', `${SKILL}\nupdated\n`)
      expect(second.replaced).toBe(true)
      expect(await readFile(second.path, 'utf8')).toContain('updated')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('refuses invalid names and empty content', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sqh-skill-'))
    try {
      await expect(installSkill(home, 'Bad_Name', SKILL)).rejects.toThrow('invalid skill name')
      await expect(installSkill(home, 'good-name', '   ')).rejects.toThrow('empty SKILL.md')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe('installMcpServer', () => {
  it('appends one insert row to a profile patch and keeps unrelated comments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-mcp-'))
    const patch = join(dir, 'cordis.patch.yml')
    try {
      await writeFile(patch, '# my patch\n- id: ui-theme\n  config:\n    preference: dark\n')
      const result = await installMcpServer(patch, 'memorix', { transport: 'stdio', command: 'memorix', args: ['serve'] })
      expect(result).toMatchObject({ kind: 'mcp', name: 'memorix', replaced: false })
      const text = await readFile(patch, 'utf8')
      expect(text).toContain('# my patch')
      expect(text).toContain('id: ui-theme')
      expect(text).toContain('id: mcp-memorix')
      expect(text).toContain('@liusiqi-dev/sqh-mcp-client')
      expect(text).toContain('serverName: memorix')
      expect(text).toContain('transport: stdio')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('updates an existing server row instead of adding a second one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-mcp-'))
    const patch = join(dir, 'cordis.patch.yml')
    try {
      await installMcpServer(patch, 'docs', { transport: 'stdio', command: 'old' })
      const result = await installMcpServer(patch, 'docs', { transport: 'streamable-http', url: 'https://example.test/mcp' })
      expect(result.replaced).toBe(true)
      const text = await readFile(patch, 'utf8')
      expect(text.match(/id: mcp-docs/g)).toHaveLength(1)
      expect(text).toContain('transport: streamable-http')
      expect(text).toContain('url: https://example.test/mcp')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses invalid names and empty endpoints', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqh-mcp-'))
    const patch = join(dir, 'cordis.patch.yml')
    try {
      await expect(installMcpServer(patch, 'bad name!', { transport: 'stdio', command: 'x' })).rejects.toThrow('invalid MCP server name')
      await expect(installMcpServer(patch, 'x', { transport: 'stdio', command: '  ' })).rejects.toThrow('must not be empty')
      await expect(installMcpServer(patch, 'x', { transport: 'streamable-http', url: '' })).rejects.toThrow('must not be empty')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
