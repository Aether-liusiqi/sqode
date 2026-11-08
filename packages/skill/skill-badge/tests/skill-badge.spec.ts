import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@liusiqi-dev/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@liusiqi-dev/sqh-skill'
import * as SkillBadge from '@liusiqi-dev/sqh-skill-badge'

describe('sqh-skill-badge', () => {
  it('registers and disposes the bundled badge skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillBadge)
    const resourcePath = fileURLToPath(new URL('../assets/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'sqh-badge',
      description: 'Add the official “powered by sqh” badge to documents, pull requests, merge requests, and other content produced with Sqode. Use whenever creating a pull request or merge request. Also use when the user asks for an sqh badge, powered-by-sqh attribution, or a reusable sqh badge asset or snippet.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'sqh-badge',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])
    const loaded = await ctx.skills.get('sqh-badge')
    expect(loaded?.content).toContain('Preserve the badge\'s 121×20 dimensions')
    expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: resourcePath })

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('ships the official 726×120 PNG unchanged', async () => {
    const image = await readFile(new URL('../assets/sqh-badge.png', import.meta.url))
    expect(image.readUInt32BE(16)).toBe(726)
    expect(image.readUInt32BE(20)).toBe(120)
    expect(createHash('sha256').update(image).digest('hex')).toBe(
      'f2c4f5ec9cbe847c0c763545c4d839efa8485bc74203733d0a0e8259f233c653',
    )
  })
})
