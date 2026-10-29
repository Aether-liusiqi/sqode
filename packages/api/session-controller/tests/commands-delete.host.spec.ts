/**
 * Deleting a Session: a Session with running work is refused, a deletion releases the
 * runtime before removing the log, and the pinned and archived sets drop the id afterwards.
 * Order matters — releasing first is what makes the removal possible on Windows, and
 * refusing first keeps a deletion from interrupting an answer still being read.
 */

import { Context } from '@liusiqi-dev/cordis'
import AgentRegistry from '@liusiqi-dev/dsh-agent'
import SessionStore, { SessionId } from '@liusiqi-dev/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionCommandController } from '../src/commands.ts'
import { installSessionReadTestServices } from './test-remote.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

function controllerAgents(overrides: object = {}): ApiSessionAgentController {
  return {
    ensureSession: () => Promise.resolve(),
    composeAgent: () => Promise.resolve({ setup: () => {} }),
    presetForSession: () => undefined,
    presetForObservation: () => undefined,
    ...overrides,
  } as unknown as ApiSessionAgentController
}

interface Harness {
  ctx: Context
  controller: SessionCommandController
  release: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  unarchive: ReturnType<typeof vi.fn>
  unpin: ReturnType<typeof vi.fn>
}

async function harness(destroyResult = true): Promise<Harness> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  installSessionReadTestServices(ctx)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: () => Promise.resolve(),
  } as never)

  const release = vi.fn(async () => true)
  const destroy = vi.fn(async () => destroyResult)
  const unarchive = vi.fn(async () => {})
  const unpin = vi.fn(async () => {})
  ctx.provide('sessionPersistence', { destroy } as never)
  ctx.provide('workspaceRegistry', {
    get: () => undefined,
    list: () => [],
    unarchiveSession: unarchive,
    unpinSession: unpin,
  } as never)

  return {
    ctx,
    controller: new SessionCommandController(ctx, controllerAgents({ release }), '/default'),
    release, destroy, unarchive, unpin,
  }
}

describe('SessionCommandController: deleting a Session', () => {
  it('releases the runtime, removes the log, and clears the pin and archive sets', async () => {
    const { controller, release, destroy, unarchive, unpin } = await harness()

    await expect(controller.delete({ sessionId: SessionId('doomed') })).resolves.toEqual({
      sessionId: SessionId('doomed'),
    })
    expect(release).toHaveBeenCalledWith(SessionId('doomed'))
    expect(destroy).toHaveBeenCalledWith(SessionId('doomed'))
    expect(unarchive).toHaveBeenCalledWith(SessionId('doomed'))
    expect(unpin).toHaveBeenCalledWith(SessionId('doomed'))
  })

  it('refuses a Session with running work without releasing or removing anything', async () => {
    const { ctx, controller, release, destroy } = await harness()
    ctx.on('workspace/session-activity', () => [{ kind: 'turn' }] as never)

    await expect(controller.delete({ sessionId: SessionId('busy') }))
      .rejects.toMatchObject({ code: 'session/agent-busy' })
    expect(release).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('reports a Session that was never stored as not found', async () => {
    const { controller, unpin } = await harness(false)

    await expect(controller.delete({ sessionId: SessionId('ghost') }))
      .rejects.toMatchObject({ code: 'session/not-found' })
    expect(unpin).not.toHaveBeenCalled()
  })
})
