/** Source classification: explicit choice, repository contents, then URL shape. */
import { describe, expect, it, vi } from 'vitest'
import {
  detectSource, detectFromContents, detectFromShape, hasExplicitSourceHint, splitExplicitPrefix,
} from '../src/source-detector.ts'
import { readSourceSnapshot } from '../src/source-snapshot.ts'

const SKILL = `---
name: sm-research
description: Research workflow
---
# Skill
`

function mockGithub(files: Record<string, string>, paths: readonly string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/git/trees/')) {
      return new Response(JSON.stringify({ tree: paths.map(path => ({ path, type: 'blob' })) }), { status: 200 })
    }
    const match = /\/contents\/(.+?)(?:\?|$)/.exec(url)
    const key = match?.[1]
    const text = key === undefined ? undefined : files[decodeURIComponent(key)]
    return text === undefined ? new Response('missing', { status: 404 }) : new Response(text, { status: 200 })
  }) as unknown as typeof fetch
}

describe('explicit prefixes and dialog hints', () => {
  it('splits kind prefixes and keeps the spec intact', () => {
    expect(splitExplicitPrefix('skill:https://github.com/acme/x')).toEqual({ kind: 'skill', spec: 'https://github.com/acme/x' })
    expect(splitExplicitPrefix('https://github.com/acme/x')).toEqual({ spec: 'https://github.com/acme/x' })
    expect(hasExplicitSourceHint('mcp:acme/server')).toBe(true)
    expect(hasExplicitSourceHint('github:acme/plugin')).toBe(false)
  })

  it('lets a prefix or hint outrank the URL shape', () => {
    expect(detectSource('skill:https://github.com/acme/mcp', 'auto').kind).toBe('skill')
    expect(detectSource('https://github.com/acme/skills/x', 'plugin').kind).toBe('plugin')
    expect(detectSource('plain', 'mcp')).toMatchObject({ kind: 'mcp', confidence: 'explicit', spec: 'plain' })
  })
})

describe('shape and content detection', () => {
  it('falls back to shape for package names, paths and obvious URLs', () => {
    expect(detectFromShape('@acme/plugin')).toBe('plugin')
    expect(detectFromShape('C:\\plugins\\x')).toBe('plugin')
    expect(detectFromShape('https://github.com/acme/skills/x')).toBe('skill')
    expect(detectFromShape('https://github.com/acme/mcp/server')).toBe('mcp')
  })

  it('recognises a Skill by SKILL.md frontmatter, not by its path alone', () => {
    expect(detectFromContents({ paths: ['SKILL.md'], files: { 'SKILL.md': SKILL } })?.kind).toBe('skill')
    expect(detectFromContents({ paths: ['SKILL.md'], files: { 'SKILL.md': '# no frontmatter' } })).toBeUndefined()
  })

  it('recognises MCP config, patch rows and plugin bundles', () => {
    expect(detectFromContents({ paths: ['mcp.json'], files: { 'mcp.json': '{}' } })?.kind).toBe('mcp')
    expect(detectFromContents({ paths: ['cordis.patch.yml'], files: { 'cordis.patch.yml': 'name: sqh-mcp-client' } })?.kind).toBe('mcp')
    expect(detectFromContents({ paths: ['package.json'], files: { 'package.json': '{"dsh":{"bundle":{}}}' } })?.kind).toBe('plugin')
  })

  it('prefers content over shape and carries the evidence', () => {
    const detected = detectSource('https://github.com/acme/plain-url', 'auto', {
      paths: ['SKILL.md'], files: { 'SKILL.md': SKILL },
    })
    expect(detected).toMatchObject({ kind: 'skill', confidence: 'content', location: '~/.sqode/skills/<name>/SKILL.md' })
    expect(detected.evidence[0]).toContain('SKILL.md')
  })
})

describe('readSourceSnapshot', () => {
  it('reads a GitHub tree and the decisive files through an injected fetch', async () => {
    const fetch = mockGithub({ 'SKILL.md': SKILL }, ['README.md', 'SKILL.md'])
    const snapshot = await readSourceSnapshot('https://github.com/acme/sm-research', { fetch })
    expect(snapshot?.paths).toContain('SKILL.md')
    expect(snapshot?.files['SKILL.md']).toBe(SKILL)
    const detected = detectSource('https://github.com/acme/sm-research', 'auto', snapshot)
    expect(detected.kind).toBe('skill')
  })

  it('attaches a token only to the API calls', async () => {
    const fetch = mockGithub({ 'mcp.json': '{}' }, ['mcp.json'])
    await readSourceSnapshot('https://github.com/acme/private', { fetch, token: () => 'secret' })
    const headers = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret')
  })

  it('returns undefined for non-GitHub inputs and unreadable sources', async () => {
    const fetch = vi.fn() as unknown as typeof fetch
    expect(await readSourceSnapshot('@acme/plugin', { fetch })).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    const failing = vi.fn(async () => new Response('rate limited', { status: 403 })) as unknown as typeof fetch
    expect(await readSourceSnapshot('https://github.com/acme/private', { fetch: failing })).toBeUndefined()
  })
})
