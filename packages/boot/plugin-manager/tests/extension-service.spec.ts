/** The remote façade wires detection, installation and the inventory together. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ExtensionManager, normalizeMcpConfig, type ExtensionServiceSeams } from '../src/extension-service.ts'

const SKILL = `---
name: sm-research
description: Research workflow
---
# Skill
`

function mockGithub(files: Record<string, string>, paths: readonly string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: paths.map(path => ({ path, type: 'blob' })) }), { status: 200 })
    const match = /\/contents\/(.+?)(?:\?|$)/.exec(url)
    const key = match?.[1]
    const text = key === undefined ? undefined : files[decodeURIComponent(key)]
    return text === undefined ? new Response('missing', { status: 404 }) : new Response(text, { status: 200 })
  }) as unknown as typeof fetch
}

function service(seams: ExtensionServiceSeams) {
  return new ExtensionManager(seams)
}

describe('ExtensionService', () => {
  it('detects a plain GitHub Skill URL by its contents', async () => {
    const s = await service({ home: await mkdtemp(join(tmpdir(), 'sqh-svc-')), installPlugin: vi.fn(), fetch: mockGithub({ 'SKILL.md': SKILL }, ['SKILL.md']) })
    const answer = await s.detect('https://github.com/acme/sm-research')
    expect(answer.ok).toBe(true)
    if (answer.ok) expect(answer.value).toMatchObject({ kind: 'skill', confidence: 'content' })
  })

  it('installs a detected Skill, lists it, and removes it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sqh-svc-'))
    try {
      const installPlugin = vi.fn(async () => ({ location: 'x' }))
      const s = await service({ home, installPlugin, fetch: mockGithub({ 'SKILL.md': SKILL }, ['SKILL.md']) })
      const installed = await s.install({ spec: 'https://github.com/acme/sm-research' })
      expect(installed.ok).toBe(true)
      if (installed.ok) {
        expect(installed.value.action).toBe('installed')
        expect(await readFile(installed.value.location, 'utf8')).toBe(SKILL)
      }
      expect((await s.list()).map(row => row.name)).toEqual(['sm-research'])
      expect(await s.remove('skill', 'sm-research')).toBe(true)
      expect(await s.list()).toEqual([])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('refuses a second install of the same source', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sqh-svc-'))
    try {
      const s = await service({ home, installPlugin: vi.fn(), fetch: mockGithub({ 'SKILL.md': SKILL }, ['SKILL.md']) })
      await s.install({ spec: 'https://github.com/acme/sm-research' })
      const again = await s.install({ spec: 'https://github.com/acme/sm-research' })
      expect(again.ok).toBe(true)
      if (again.ok) expect(again.value.action).toBe('already-installed')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('routes an explicit MCP hint to the patch installer', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sqh-svc-'))
    try {
      const s = await service({ home, installPlugin: vi.fn(), fetch: vi.fn() as unknown as typeof fetch })
      const answer = await s.install({
        spec: 'acme/docs', hint: 'mcp', config: { transport: 'stdio', command: 'docs-mcp' },
      })
      expect(answer.ok).toBe(true)
      if (answer.ok) expect(answer.value.kind).toBe('mcp')
      expect((await s.list('mcp')).map(row => row.name)).toEqual(['docs'])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe('normalizeMcpConfig', () => {
  it('converts the ecosystem standard mcpServers object into a flat stdio config', () => {
    expect(normalizeMcpConfig(
      { mcpServers: { playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] } } },
      'playwright-mcp',
    )).toEqual({
      name: 'playwright',
      config: { transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
    })
  })

  it('maps an http server to streamable-http and keeps headers', () => {
    expect(normalizeMcpConfig(
      { mcpServers: { remote: { url: 'https://mcp.example.com/sse', headers: { Authorization: 'Bearer x' } } } },
      'remote',
    )).toEqual({
      name: 'remote',
      config: {
        transport: 'streamable-http',
        url: 'https://mcp.example.com/sse',
        headers: { Authorization: 'Bearer x' },
      },
    })
  })

  it('honors an explicit sse type', () => {
    expect(normalizeMcpConfig(
      { mcpServers: { s: { type: 'sse', url: 'https://mcp.example.com/sse' } } },
      's',
    ).config.transport).toBe('streamable-http')
  })

  it('accepts an already-flat Sqode config unchanged', () => {
    expect(normalizeMcpConfig(
      { serverName: 'docs', transport: 'stdio', command: 'docs-mcp', env: { KEY: 'v' } },
      'ignored',
    )).toEqual({
      name: 'docs',
      config: { transport: 'stdio', command: 'docs-mcp', env: { KEY: 'v' } },
    })
  })

  it('picks the server whose key matches the repository name', () => {
    const result = normalizeMcpConfig(
      { mcpServers: { alpha: { command: 'a' }, target: { command: 't' } } },
      'target',
    )
    expect(result.name).toBe('target')
    expect(result.config).toMatchObject({ command: 't' })
  })

  it('rejects a config with neither command nor url instead of writing a broken row', () => {
    expect(() => normalizeMcpConfig({ mcpServers: { broken: { args: ['x'] } } }, 'broken'))
      .toThrow(/needs a command or url/)
    expect(() => normalizeMcpConfig(undefined, 'x')).toThrow(/config is required/)
  })
})
