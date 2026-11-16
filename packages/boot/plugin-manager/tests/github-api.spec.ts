/** GitHub REST resolution: URL forms, token handling, and classified failures. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseGithubRepository, resolveGithubTarball } from '../src/github-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('parseGithubRepository', () => {
  it('reads plain hosted URLs with and without .git', () => {
    expect(parseGithubRepository('https://github.com/acme/plugin')).toEqual({ owner: 'acme', repo: 'plugin' })
    expect(parseGithubRepository('https://github.com/acme/plugin.git')).toEqual({ owner: 'acme', repo: 'plugin' })
  })

  it('reads shorthand, git+https, fragment refs and tree refs', () => {
    expect(parseGithubRepository('github:acme/plugin')).toEqual({ owner: 'acme', repo: 'plugin' })
    expect(parseGithubRepository('git+https://github.com/acme/plugin')).toEqual({ owner: 'acme', repo: 'plugin' })
    expect(parseGithubRepository('https://github.com/acme/plugin#v1.2.3')).toEqual({ owner: 'acme', repo: 'plugin', ref: 'v1.2.3' })
    expect(parseGithubRepository('https://github.com/acme/plugin/tree/main')).toEqual({ owner: 'acme', repo: 'plugin', ref: 'main' })
  })

  it('refuses non-GitHub hosts, package names and malformed paths', () => {
    expect(parseGithubRepository('@acme/plugin')).toBeUndefined()
    expect(parseGithubRepository('https://gitlab.com/acme/plugin')).toBeUndefined()
    expect(parseGithubRepository('https://github.com/acme')).toBeUndefined()
    expect(parseGithubRepository('')).toBeUndefined()
  })
})

describe('resolveGithubTarball', () => {
  const repo = { owner: 'acme', repo: 'plugin' }

  it('resolves HEAD to a commit and returns a codeload tarball spec', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveGithubTarball(repo, { apiBase: 'https://api.example' })
    expect(result).toEqual({
      ok: true,
      value: {
        spec: 'https://codeload.github.com/acme/plugin/tar.gz/abc123',
        source: 'acme/plugin@abc123',
        sha: 'abc123',
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/repos/acme/plugin/commits/HEAD',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('uses the ref and a Bearer token from the injected source', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sha: 'def456' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveGithubTarball({ ...repo, ref: 'v1.0.0' }, {
      apiBase: 'https://api.example', token: () => 'secret',
    })
    expect(result.ok).toBe(true)
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/commits/v1.0.0')
  })

  it('does not attach a header when no token is present', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await resolveGithubTarball(repo, { apiBase: 'https://api.example', token: () => undefined })
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })

  it('classifies an HTTP failure with the status in the diagnostic', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const result = await resolveGithubTarball(repo, { apiBase: 'https://api.example' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.output).toContain('404')
      expect(result.error.exitCode).toBe(1)
    }
  })

  it('classifies a timeout separately from a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      await new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      throw new Error('unreachable')
    }))
    const result = await resolveGithubTarball(repo, { apiBase: 'https://api.example', timeoutMs: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.output).toContain('timed out')
  })

  it('refuses an oversized metadata answer before reading its body', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', {
      status: 200, headers: { 'content-length': '9999999' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveGithubTarball(repo, { apiBase: 'https://api.example', maxBytes: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.output).toContain('exceeds')
  })

  it('passes an external cancellation through to the request', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted === true) throw new Error('aborted')
      return new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 })
    }))
    const result = await resolveGithubTarball(repo, { apiBase: 'https://api.example', signal: controller.signal })
    expect(result.ok).toBe(false)
  })
})
