/**
 * The summarization call must not fail the compaction that asked for it when the
 * target refuses the replay as longer than its own context window: replaying a
 * near-window conversation to the window that just rejected it fails the same
 * way, and the Session would then have no route back under the limit.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@liusiqi-dev/cordis'
import { CONTEXT_WINDOW_EXCEEDED_CODE, LlmError } from '@liusiqi-dev/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@liusiqi-dev/dsh-llm'
import type { Agent } from '@liusiqi-dev/dsh-agent'
import { summarizeWithLlm } from '../src/summarizer.ts'

const CONFIG = { summarizationProvider: 'test', summarizationModel: 'target', maxTokens: 4096 }

/** A conversation turn as the replay builder hands it over. */
function turn(role: 'system' | 'user', text: string): Message {
  return { role, content: [{ type: 'text', text }] } as unknown as Message
}

/** An agent whose routed target and history are exactly what the summarizer reads. */
function agent(): Agent {
  return {
    options: {},
    session: { id: 'session-shrink', requestHeader: () => undefined, toolHistory: () => [] },
  } as unknown as Agent
}

/** A host whose `ctx.llm.stream()` records every attempt and delegates to `answer`. */
function host(
  answer: (attempt: number) => AsyncIterable<StreamChunk>,
  calls: GenerateOptions[],
): Context {
  let attempt = 0
  return {
    llm: {
      stream: (options: GenerateOptions) => {
        attempt += 1
        calls.push(options)
        return answer(attempt)
      },
    },
  } as unknown as Context
}

/** One complete text response. */
async function* reply(text: string): AsyncGenerator<StreamChunk> {
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** The refusal a target sends when the prompt is longer than its window. */
function rejected(): LlmError {
  return new LlmError(
    '400 {"error":{"code":"context_length_exceeded","message":"prompt is too long: 100001 tokens > 100000 maximum"}}',
    CONTEXT_WINDOW_EXCEEDED_CODE,
  )
}

describe('summarizeWithLlm context-window recovery', () => {
  it('gives back completion budget and retries when the target refuses the prompt length', async () => {
    const calls: GenerateOptions[] = []
    const result = await summarizeWithLlm(
      host(attempt => attempt === 1 ? (async function* () { throw rejected() })() : reply('## Current Work\n- continuing'), calls),
      CONFIG,
      { messages: [turn('system', 'be brief'), turn('user', 'older work'), turn('user', 'newer work')] },
      agent(),
    )

    expect(calls).toHaveLength(2)
    // 4096 / 4 lands on the floor: the cheapest retry that still writes a checkpoint.
    expect(calls[1]?.maxTokens).toBe(1_024)
    expect(result.maxTokens).toBe(1_024)
    expect(JSON.stringify(result.summary)).toContain('continuing')
    // The replay itself is untouched while output budget alone can buy the room.
    expect(calls[1]?.messages.length).toBe(calls[0]?.messages.length)
  })

  it('drops the oldest turns once the completion floor is reached, keeping the system head', async () => {
    const calls: GenerateOptions[] = []
    const replayed = [
      turn('system', 'be brief'),
      ...Array.from({ length: 8 }, (_, index) => turn('user', `turn ${index}`)),
    ]
    await expect(summarizeWithLlm(
      host(() => (async function* () { throw rejected() })(), calls),
      CONFIG,
      { messages: replayed },
      agent(),
    )).rejects.toMatchObject({ code: CONTEXT_WINDOW_EXCEEDED_CODE })

    const last = calls.at(-1)
    expect(last).toBeDefined()
    expect(last!.messages.length).toBeLessThan(calls[0]!.messages.length)
    expect(last!.messages[0]?.role).toBe('system')
    // The instruction still trails every attempt, including the trimmed ones.
    expect(last!.messages.at(-1)?.role).toBe('user')
    expect(JSON.stringify(last!.messages.at(-1))).toContain('compaction engine')
  })

  it('surfaces any other failure on the first attempt', async () => {
    const calls: GenerateOptions[] = []
    await expect(summarizeWithLlm(
      host(() => (async function* () { throw new LlmError('provider exploded', 'PROVIDER') })(), calls),
      CONFIG,
      { messages: [turn('user', 'work')] },
      agent(),
    )).rejects.toMatchObject({ code: 'PROVIDER' })
    expect(calls).toHaveLength(1)
  })
})
