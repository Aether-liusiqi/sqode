/** Version comparison, dual-source checks, caching and in-flight sharing for plugin updates. */
import { describe, expect, it, vi } from 'vitest'
import { createUpdateChecker, githubUpdateLookup, installedFromBundles, isGithubDependency, updateFor } from '../src/update-checker.ts'
import type { BundleInfo, PluginUpdateInfo } from '../src/types.ts'

describe('updateFor', () => {
  const registry = { name: '@acme/plugin', version: '1.2.3', dependency: '^1.2.3' }

  it('offers an exact registry spec when a newer version exists', () => {
    expect(updateFor(registry, '1.3.0')).toEqual({
      name: '@acme/plugin', currentVersion: '1.2.3', latestVersion: '1.3.0',
      source: 'registry', spec: '@acme/plugin@1.3.0',
    })
  })

  it('stays quiet for same, older or invalid versions', () => {
    expect(updateFor(registry, '1.2.3')).toBeUndefined()
    expect(updateFor(registry, '1.1.0')).toBeUndefined()
    expect(updateFor(registry, 'not-a-version')).toBeUndefined()
    expect(updateFor({ name: 'x', dependency: 'x' }, '1.0.0')).toBeUndefined()
  })

  it('offers a tarball spec when a GitHub commit differs', () => {
    expect(updateFor({ ...registry, version: 'oldsha' }, undefined, { sha: 'newsha', spec: 'https://codeload.github.com/a/b/tar.gz/newsha' })).toEqual({
      name: '@acme/plugin', currentVersion: 'oldsha', latestVersion: 'newsha',
      source: 'github', spec: 'https://codeload.github.com/a/b/tar.gz/newsha',
    })
    expect(updateFor({ ...registry, version: 'newsha' }, undefined, { sha: 'newsha', spec: 'x' })).toBeUndefined()
  })
})

describe('isGithubDependency', () => {
  it('separates GitHub specs from registry specs', () => {
    expect(isGithubDependency('github:acme/plugin')).toBe(true)
    expect(isGithubDependency('https://github.com/acme/plugin')).toBe(true)
    expect(isGithubDependency('@acme/plugin')).toBe(false)
  })
})

describe('createUpdateChecker', () => {
  const bundle = { name: '@acme/plugin', version: '1.2.3', dependency: '@acme/plugin' }

  function ports(latest = '1.3.0') {
    return {
      viewLatest: vi.fn(async (_name: string) => latest),
      resolveGithub: vi.fn(async (_dependency: string) => undefined as { sha: string; spec: string } | undefined),
      install: vi.fn(async () => ({ changed: true })),
    }
  }

  it('returns only packages with updates', async () => {
    const p = ports()
    p.viewLatest.mockImplementation(async (name: string) => name === '@acme/plugin' ? '1.3.0' : '1.0.0')
    const checker = createUpdateChecker(p)
    const result = await checker.checkUpdates([bundle, { name: 'same', version: '1.0.0', dependency: 'same' }])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('@acme/plugin')
  })

  it('caches a fresh answer', async () => {
    const p = ports()
    const checker = createUpdateChecker(p)
    await checker.checkUpdates([bundle])
    await checker.checkUpdates([bundle])
    expect(p.viewLatest).toHaveBeenCalledOnce()
  })

  it('shares an in-flight check', async () => {
    let release!: (value: string) => void
    const p = ports()
    p.viewLatest.mockImplementation(() => new Promise<string>((resolve) => { release = resolve }))
    const checker = createUpdateChecker(p)
    const first = checker.checkUpdates([bundle])
    const second = checker.checkUpdates([bundle])
    release('1.3.0')
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(p.viewLatest).toHaveBeenCalledOnce()
  })

  it('forgets the cache after applying an update', async () => {
    const p = ports()
    const checker = createUpdateChecker(p)
    const updates = await checker.checkUpdates([bundle])
    await checker.applyUpdate(updates[0] as PluginUpdateInfo)
    await checker.checkUpdates([bundle])
    expect(p.viewLatest).toHaveBeenCalledTimes(2)
    expect(p.install).toHaveBeenCalledWith('@acme/plugin@1.3.0')
  })

  it('asks the GitHub seam for a GitHub dependency', async () => {
    const p = ports()
    p.resolveGithub.mockResolvedValue({ sha: 'newsha', spec: 'tarball' })
    const checker = createUpdateChecker(p)
    const result = await checker.checkUpdates([{ name: 'gh', version: 'oldsha', dependency: 'github:acme/plugin' }])
    expect(p.viewLatest).not.toHaveBeenCalled()
    expect(result[0]?.source).toBe('github')
  })

  it('survives a lookup that refuses to answer', async () => {
    const p = ports()
    p.viewLatest.mockRejectedValue(new Error('registry down'))
    const checker = createUpdateChecker(p)
    await expect(checker.checkUpdates([bundle])).rejects.toThrow('registry down')
  })
})

describe('githubUpdateLookup', () => {
  it('returns undefined for a non-GitHub dependency', async () => {
    expect(await githubUpdateLookup()('plain-package')).toBeUndefined()
  })
})

describe('installedFromBundles', () => {
  it('maps only installed bundles and keeps their saved spec', () => {
    const bundles = [
      { name: 'a', installed: true, version: '1.0.0' },
      { name: 'b', installed: false, version: '2.0.0' },
    ] as BundleInfo[]
    expect(installedFromBundles(bundles, { a: '^1.0.0' })).toEqual([
      { name: 'a', version: '1.0.0', dependency: '^1.0.0' },
    ])
  })
})
