/** The field's kind is decided from the text alone, before any Host call. */
import { describe, expect, it } from 'vitest'
import { classifyInstallInput, isExplicitKind } from '../src/client/classify-install-input.ts'

describe('classifyInstallInput', () => {
  it('takes an explicit prefix as final, whatever follows it', () => {
    expect(classifyInstallInput('skill: https://github.com/acme/repo'))
      .toEqual({ kind: 'skill', spec: 'https://github.com/acme/repo', reason: 'explicit' })
    expect(classifyInstallInput('MCP:acme/server'))
      .toEqual({ kind: 'mcp', spec: 'acme/server', reason: 'explicit' })
    // The prefix wins even for a name the plugin path could have accepted:
    // otherwise npm spec parsing would veto the kind the person named.
    expect(classifyInstallInput('plugin: some-package@1.0.0'))
      .toEqual({ kind: 'plugin', spec: 'some-package@1.0.0', reason: 'explicit' })
  })

  it('accepts a full-width colon as an explicit prefix, as IMEs emit it', () => {
    expect(classifyInstallInput('skill： https://github.com/acme/repo'))
      .toEqual({ kind: 'skill', spec: 'https://github.com/acme/repo', reason: 'explicit' })
    expect(classifyInstallInput('MCP：acme/server'))
      .toEqual({ kind: 'mcp', spec: 'acme/server', reason: 'explicit' })
    expect(classifyInstallInput('skill ：  C:\\a b\\SKILL.md  ').spec).toBe('C:\\a b\\SKILL.md')
    expect(isExplicitKind('skill：x')).toBe(true)
  })

  it('reads a local SKILL.md path as a Skill', () => {
    expect(classifyInstallInput('C:\\Users\\me\\.claude\\skills\\SM-research\\SKILL.md'))
      .toEqual({ kind: 'skill', spec: 'C:\\Users\\me\\.claude\\skills\\SM-research\\SKILL.md', reason: 'path' })
    expect(classifyInstallInput('./skills/demo/SKILL.md'))
      .toEqual({ kind: 'skill', spec: './skills/demo/SKILL.md', reason: 'path' })
  })

  it('leaves everything else on the plugin path', () => {
    for (const input of [
      'sqh-better-sidebar',
      '@liusiqi-dev/sqh-base',
      'https://github.com/acme/plugin',
      'C:\\plugins\\local-addon',
      'C:\\Users\\me\\skills\\demo',
    ]) {
      expect(classifyInstallInput(input), input).toMatchObject({ kind: 'plugin', reason: 'plugin-syntax' })
    }
  })

  it('trims around the prefix without touching the spec', () => {
    expect(classifyInstallInput('  skill :  C:\\a b\\SKILL.md  ').spec).toBe('C:\\a b\\SKILL.md')
  })

  it('reports only a real prefix as explicit', () => {
    expect(isExplicitKind('skill:x')).toBe(true)
    expect(isExplicitKind('https://x')).toBe(false)
    expect(isExplicitKind('@scope/skill:1.0.0')).toBe(false)
  })
})
