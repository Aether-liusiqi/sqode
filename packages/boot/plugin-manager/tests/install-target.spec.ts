/** Install target classification: explicit prefixes, hints, and URL shape. */
import { describe, expect, it } from 'vitest'
import { classifyInstallTarget, hasExplicitTargetHint, INSTALL_LOCATIONS } from '../src/install-target.ts'

describe('classifyInstallTarget', () => {
  it('keeps every previous plugin spec as a plugin', () => {
    for (const spec of [
      '@liusiqi-dev/sqh-client-ui-primitives',
      'sqh-better-sidebar@1.2.3',
      'https://github.com/acme/plugin',
      'github:acme/plugin',
      'git+https://github.com/acme/plugin',
      'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',
      'C:\\plugins\\local-addon',
    ]) {
      expect(classifyInstallTarget(spec)).toEqual({ kind: 'plugin', spec, location: INSTALL_LOCATIONS.plugin })
    }
  })

  it('recognises Skill URLs and files', () => {
    expect(classifyInstallTarget('https://github.com/acme/agent-skills/tree/main/skills/SM-research')).toMatchObject({ kind: 'skill' })
    expect(classifyInstallTarget('https://raw.githubusercontent.com/acme/repo/main/SKILL.md')).toMatchObject({ kind: 'skill' })
  })

  it('recognises an MCP repository path', () => {
    expect(classifyInstallTarget('https://github.com/acme/mcp')).toMatchObject({ kind: 'mcp' })
  })

  it('lets an explicit prefix win over URL shape', () => {
    expect(classifyInstallTarget('plugin:https://github.com/acme/skills/demo')).toEqual({
      kind: 'plugin', spec: 'https://github.com/acme/skills/demo', location: INSTALL_LOCATIONS.plugin,
    })
    expect(classifyInstallTarget('skill:https://github.com/acme/plugin')).toEqual({
      kind: 'skill', spec: 'https://github.com/acme/plugin', location: INSTALL_LOCATIONS.skill,
    })
    expect(classifyInstallTarget('mcp:@acme/server')).toEqual({
      kind: 'mcp', spec: '@acme/server', location: INSTALL_LOCATIONS.mcp,
    })
  })

  it('lets a dialog hint override inference without changing the spec', () => {
    expect(classifyInstallTarget('https://github.com/acme/agent-skills', 'plugin')).toEqual({
      kind: 'plugin', spec: 'https://github.com/acme/agent-skills', location: INSTALL_LOCATIONS.plugin,
    })
    expect(classifyInstallTarget('acme/server', 'mcp')).toEqual({
      kind: 'mcp', spec: 'acme/server', location: INSTALL_LOCATIONS.mcp,
    })
  })

  it('trims whitespace and reports explicit prefixes', () => {
    expect(classifyInstallTarget('  skill:acme/demo  ')).toMatchObject({ kind: 'skill', spec: 'acme/demo' })
    expect(hasExplicitTargetHint('skill:acme/demo')).toBe(true)
    expect(hasExplicitTargetHint('github:acme/demo')).toBe(false)
    expect(hasExplicitTargetHint('https://github.com/acme/demo')).toBe(false)
  })
})
