/**
 * Releasing a session's live runtime. The controller keeps the handle the agent
 * factory returns, because that handle is the only thing that can stop the loop and
 * unwind the agent's scope; a deletion needs it released before the stored directory
 * can be removed. A session that was never loaded has nothing to release and must not
 * be reported as a failure.
 */

import { Context } from '@liusiqi-dev/cordis'
import AgentRegistry from '@liusiqi-dev/dsh-agent'
import type { Agent, AgentHandle } from '@liusiqi-dev/dsh-agent'
import { agentPresetProjectionDefinition } from '@liusiqi-dev/dsh-agent-preset-registry'
import SessionStore, { SessionId } from '@liusiqi-dev/dsh-session'
import TypertRegistry from '@liusiqi-dev/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiSessionAgentController } from '../src/agent.ts'
import { installModelSelectionProjection } from '../src/model-selection-projection.ts'
import { installSessionReadTestServices } from './test-remote.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(): Promise<{ ctx: Context; agents: ApiSessionAgentController }> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  installSessionReadTestServices(ctx)
  ctx.sessionProjections.register(agentPresetProjectionDefinition)
  installModelSelectionProjection(ctx)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: () => Promise.resolve(),
  } as never)
  return { ctx, agents: new ApiSessionAgentController(ctx) }
}

/** A handle whose disposal is observable, shaped like the factory's own. */
function handle(id: string, ctx: Context): { handle: AgentHandle; dispose: ReturnType<typeof vi.fn> } {
  const session = ctx.sessions.create(SessionId(id), {
    meta: { version: 4 as never, id: SessionId(id), createdAt: 1, cwd: '/workspace', isSeeded: false },
  } as never)
  const agent = { id: SessionId(id), session, status: 'idle', ctx } as Agent
  const dispose = vi.fn(async () => {})
  return { handle: { agent, dispose } as AgentHandle, dispose }
}

describe('ApiSessionAgentController: releasing a runtime', () => {
  it('disposes the retained handle once and reports a repeat call as nothing to release', async () => {
    const { ctx, agents } = await harness()
    const { handle: live, dispose } = handle('release-once', ctx)
    vi.spyOn(ctx.agents, 'create').mockResolvedValue(live)

    const adopted = await agents.ensureSession(SessionId('release-once'), '/workspace', false)
    expect(adopted).toBe(live.agent)

    await expect(agents.release(SessionId('release-once'))).resolves.toBe(true)
    expect(dispose).toHaveBeenCalledTimes(1)

    // The handle is gone: releasing again is a no-op, not an error.
    await expect(agents.release(SessionId('release-once'))).resolves.toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('releases a session that was never loaded without disposing anything', async () => {
    const { agents } = await harness()
    await expect(agents.release(SessionId('never-loaded'))).resolves.toBe(false)
  })
})
