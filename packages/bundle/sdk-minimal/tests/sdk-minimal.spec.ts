/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@liusiqi-dev/cordis-plugin-include'

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

describe('dsh-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@liusiqi-dev/sqh-sdk-app'],
      ['sdk-jsonrpc-server', '@liusiqi-dev/sqh-sdk-jsonrpc-server'],
      ['deepseek-llm-api-extensions', '@liusiqi-dev/sqh-deepseek-llm-api-extensions'],
      ['session-log-deepseek', '@liusiqi-dev/sqh-session-log-deepseek'],
      ['plugin-package-inventory-deepseek', '@liusiqi-dev/sqh-plugin-package-inventory-deepseek'],
      ['llm-deepseek', '@liusiqi-dev/sqh-llm-deepseek-api-key'],
      ['sandbox', '@liusiqi-dev/sqh-sandbox-local'],
      ['session-projection', '@liusiqi-dev/sqh-session-projection'],
      ['sandbox-policy', '@liusiqi-dev/sqh-sandbox-policy'],
      ['subprocess', '@liusiqi-dev/sqh-subprocess-local'],
      ['pty', '@liusiqi-dev/sqh-terminal'],
      ['terminal-bash', '@liusiqi-dev/sqh-terminal-bash'],
      ['terminal-pwsh', '@liusiqi-dev/sqh-terminal-bash'],
      ['timer', '@liusiqi-dev/cordis-plugin-timer'],
      ['llm', '@liusiqi-dev/sqh-llm'],
      ['session', '@liusiqi-dev/sqh-session'],
      ['session-title', '@liusiqi-dev/sqh-session-title'],
      ['system-prompt', '@liusiqi-dev/sqh-system-prompt'],
      ['tools', '@liusiqi-dev/sqh-tools'],
      ['mcp-resources', '@liusiqi-dev/sqh-mcp-resources'],
      ['agent', '@liusiqi-dev/sqh-agent'],
      ['llm-retry', '@liusiqi-dev/sqh-llm-retry'],
      ['jobs', '@liusiqi-dev/sqh-jobs-local'],
      ['invariants', '@liusiqi-dev/sqh-invariants'],
      ['session-invariant', '@liusiqi-dev/sqh-session/invariant'],
      ['agent-invariant', '@liusiqi-dev/sqh-agent/invariant'],
      ['scope-invariant', '@liusiqi-dev/sqh-scope/invariant'],
      ['agent-loop-invariant', '@liusiqi-dev/sqh-agent-loop/invariant'],
      ['agent-loop', '@liusiqi-dev/sqh-agent-loop'],
      ['persistent-bash', '@liusiqi-dev/sqh-tool-bash-persistent'],
      ['persistent-pwsh', '@liusiqi-dev/sqh-tool-pwsh-persistent'],
      ['sessions', '@liusiqi-dev/sqh-session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    expect(rows.find(row => row.id === 'llm-deepseek')?.config).toEqual({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      defaultContextWindow: { __jsExpr: 'Number(process.env.SQODE_CONTEXT_WINDOW ?? 1000000)' },
      streamIdleTimeoutMs: 172800000,
    })
    expect(rows.find(row => row.id === 'system-prompt')?.config).toEqual({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: { __jsExpr: "process.env.SQODE_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'" },
    })
    expect(rows.find(row => row.id === 'agent-loop')?.config).toEqual({ agents: [] })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined).map(packageName))].sort(),
    )
  })
})
