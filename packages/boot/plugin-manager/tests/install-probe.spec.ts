/** Content-based install source classification through a mocked GitHub API. */
import { describe, expect, it, vi } from 'vitest'
import { probeInstallSource } from '../src/install-probe.ts'

/** A fetch mock that answers tree and contents URLs from a small fixture. */
function mockApi(files: Readonly<Record<string, string>>, treePaths: readonly string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const headers = new Headers({ 'content-length': '100' })
    if (url.includes('/git/trees/')) {
      return new Response(JSON.stringify({ tree: treePaths.map(path => ({ path, type: 'blob' })) }), { status: 200, headers })
    }
    const match = /\/contents\/(.+?)(?:\?|$)/.exec(url)
    const key = match?.[1]
    const text = key === undefined ? undefined : files[decodeURIComponent(key)]
    return text === undefined ? new Response('not found', { status: 404 }) : new Response(text, { status: 200, headers })
  }) as unknown as typeof fetch
}

const SKILL = `---
name: sm-research
description: Structured research workflow
---
# SM Research
`

describe('probeInstallSource', () => {
  it('recognises a Skill from SKILL.md even when the URL has no skills hint', async () => {
    const fetch = mockApi({ 'SKILL.md': SKILL }, ['README.md', 'SKILL.md', 'references/guide.md'])
    const result = await probeInstallSource('https://github.com/acme/sm-research', { fetch })
    expect(result).toMatchObject({ kind: 'skill', confidence: 'content' })
    expect(result?.evidence.signals.join()).toContain('SKILL.md')
    expect(result?.evidence.source).toBe('SKILL.md')
  })

  it('recognises an MCP repository from an mcp config file', async () => {
    const fetch = mockApi({ 'mcp.json': '{"mcpServers":{}}' }, ['mcp.json', 'README.md'])
    expect(await probeInstallSource('https://github.com/acme/server', { fetch })).toMatchObject({ kind: 'mcp', confidence: 'content' })
  })

  it('recognises an MCP repository from a Cordis patch row', async () => {
    const fetch = mockApi({ 'cordis.patch.yml': '- insert:\n  - id: memory-x\n    name: "@liusiqi-dev/sqh-mcp-client"\n' }, ['cordis.patch.yml'])
    expect(await probeInstallSource('https://github.com/acme/memory', { fetch })).toMatchObject({ kind: 'mcp', confidence: 'content' })
  })

  it('recognises a plugin from package.json bundle declaration', async () => {
    const fetch = mockApi({ 'package.json': '{"name":"p","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}' }, ['package.json', 'lib/index.js'])
    expect(await probeInstallSource('https://github.com/acme/plugin', { fetch })).toMatchObject({ kind: 'plugin', confidence: 'content' })
  })

  it('falls back to shape inference when no decisive content exists', async () => {
    const fetch = mockApi({ 'package.json': '{"name":"p"}' }, ['package.json', 'README.md'])
    const shapeOnly = await probeInstallSource('https://github.com/acme/skills-demo', { fetch })
    expect(shapeOnly).toBeUndefined()
  })

  it('skips non-GitHub sources', async () => {
    const fetch = vi.fn() as unknown as typeof fetch
    expect(await probeInstallSource('@acme/plugin', { fetch })).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns undefined when the tree cannot be read', async () => {
    const fetch = vi.fn(async () => new Response('rate limited', { status: 403 })) as unknown as typeof fetch
    expect(await probeInstallSource('https://github.com/acme/private', { fetch })).toBeUndefined()
  })

  it('attaches a provided token only to API requests', async () => {
    const fetch = mockApi({ 'mcp.json': '{}' }, ['mcp.json'])
    await probeInstallSource('https://github.com/acme/private', { fetch, token: () => 'secret' })
    const headers = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret')
  })
})
