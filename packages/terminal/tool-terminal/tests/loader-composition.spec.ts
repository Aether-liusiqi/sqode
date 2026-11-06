import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@liusiqi-dev/cordis'
import Loader from '@liusiqi-dev/cordis-plugin-loader'
import Include from '@liusiqi-dev/cordis-plugin-include'
import { ToolCallId } from '@liusiqi-dev/sqh-llm'
import { Session, SessionId } from '@liusiqi-dev/sqh-session'
import AgentRegistry from '@liusiqi-dev/sqh-agent'
import type { Agent } from '@liusiqi-dev/sqh-agent'
import SystemPrompt from '@liusiqi-dev/sqh-system-prompt'
import ToolRuntime from '@liusiqi-dev/sqh-tools'
import TerminalSessionService from '@liusiqi-dev/sqh-terminal'
import SandboxProvider from '@liusiqi-dev/sqh-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@liusiqi-dev/sqh-sandbox'
import SandboxPolicyService from '@liusiqi-dev/sqh-sandbox-policy'
import SessionProjectionRegistry from '@liusiqi-dev/sqh-session-projection'
import LocalSubprocessRuntime from '@liusiqi-dev/sqh-subprocess-local'
import * as TerminalLocal from '@liusiqi-dev/sqh-terminal-bash'
import * as ToolPty from '@liusiqi-dev/sqh-tool-terminal'
import { unsupportedInbox } from '@liusiqi-dev/sqh-agent-loop-testkit'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  async confine(argv: readonly string[], _policy: SandboxPolicy): Promise<ConfinedArgv> {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

async function agent(ctx: Context): Promise<Agent> {
  const scope = ctx.plugin(() => {})
  const id = SessionId('pty-loader-agent')
  const session = Session.create(id)
  const value: Agent = {
    id, options: {}, session, inbox: unsupportedInbox(),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(value)
  return value
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

suite('terminal real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and preserves shell state across real tool calls', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-pty-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@liusiqi-dev/sqh-agent'",
      "- name: '@liusiqi-dev/sqh-system-prompt'",
      "- name: '@liusiqi-dev/sqh-tools'",
      "- name: '@liusiqi-dev/sqh-terminal'",
      "- name: '@liusiqi-dev/sqh-test-sandbox'",
      "- name: '@liusiqi-dev/sqh-session-projection'",
      "- name: '@liusiqi-dev/sqh-sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@liusiqi-dev/sqh-subprocess-local'",
      "- name: '@liusiqi-dev/sqh-terminal-bash'",
      '  config:',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 250',
      '    handoffGraceMs: 250',
      '    timeoutMs: 2000',
      '    disposeGraceMs: 500',
      "- name: '@liusiqi-dev/sqh-tool-terminal'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@liusiqi-dev/sqh-agent', AgentRegistry],
      ['@liusiqi-dev/sqh-system-prompt', SystemPrompt],
      ['@liusiqi-dev/sqh-tools', ToolRuntime],
      ['@liusiqi-dev/sqh-terminal', TerminalSessionService],
      ['@liusiqi-dev/sqh-test-sandbox', PassthroughSandbox],
      ['@liusiqi-dev/sqh-session-projection', SessionProjectionRegistry],
      ['@liusiqi-dev/sqh-sandbox-policy', SandboxPolicyService],
      ['@liusiqi-dev/sqh-subprocess-local', LocalSubprocessRuntime],
      ['@liusiqi-dev/sqh-terminal-bash', TerminalLocal],
      ['@liusiqi-dev/sqh-tool-terminal', ToolPty],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = await agent(context)
    const signal = new AbortController().signal
    const spawn = await context.tools.execute({
      signal, callId: ToolCallId('spawn'), name: 'terminal_open', arguments: { type: 'shell', name: 'main', cwd: root }, agent: owner,
    })
    expect(resultText(spawn)).toContain('started terminal session pty-1 (main)')

    await context.tools.execute({
      signal, callId: ToolCallId('state'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'export KEEP=loader; cd /' }, agent: owner,
    })
    const read = await context.tools.execute({
      signal, callId: ToolCallId('read'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'printf "cwd=%s keep=%s\\n" "$PWD" "$KEEP"' }, agent: owner,
    })
    expect(resultText(read)).toContain('cwd=/ keep=loader')
    expect(context.terminals.list(owner)).toHaveLength(1)
  }, 15_000)
})
