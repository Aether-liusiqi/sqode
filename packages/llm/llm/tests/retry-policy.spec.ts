import { describe, expect, it } from 'vitest'
import {
  resolveRetryPolicy,
  RetryPolicySchema,
} from '@liusiqi-dev/sqh-llm'
import type { RetryPolicyConfig } from '@liusiqi-dev/sqh-llm'
import { MAX_TIMER_DELAY_MS } from '@liusiqi-dev/sqh-timeout'

describe('provider retry policy', () => {
  it('resolves immutable normal defaults', () => {
    const policy = resolveRetryPolicy(undefined, 'provider.retryPolicy')

    expect(policy).toEqual({
      mode: 'normal',
      maxRetries: 5,
      retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
    expect(Object.isFrozen(policy)).toBe(true)
    if (policy.mode !== 'normal') throw new Error('expected normal policy')
    expect(Object.isFrozen(policy.retryableCodes)).toBe(true)
  })

  it('resolves and detaches a configured normal policy', () => {
    const retryableCodes = ['BUSY']
    const config: RetryPolicyConfig = {
      mode: 'normal',
      maxRetries: 4,
      retryableCodes,
      backoff: {
        initialDelayMs: 25,
        maxDelayMs: 100,
        jitterRatio: 0,
      },
    }

    const policy = resolveRetryPolicy(config, 'provider.retryPolicy')
    retryableCodes.push('LATE')

    expect(policy).toEqual({
      mode: 'normal',
      maxRetries: 4,
      retryableCodes: ['BUSY'],
      initialDelayMs: 25,
      maxDelayMs: 100,
      jitterRatio: 0,
    })
  })

  it('resolves always mode with default backoff', () => {
    expect(resolveRetryPolicy({ mode: 'always' }, 'provider.retryPolicy')).toEqual({
      mode: 'always',
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
    expect(RetryPolicySchema).toBeDefined()
  })

  it('resolves always mode with an optional retry budget', () => {
    const policy = resolveRetryPolicy({
      mode: 'always',
      budget: { maxRetries: 3, maxElapsedMs: 5000 },
    }, 'provider.retryPolicy')

    expect(policy).toEqual({
      mode: 'always',
      maxRetries: 3,
      maxElapsedMs: 5000,
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
  })

  it('resolves a partial always budget without adding absent fields', () => {
    const policy = resolveRetryPolicy({
      mode: 'always',
      budget: { maxRetries: 2 },
    }, 'provider.retryPolicy')

    if (policy.mode !== 'always') throw new Error('expected always policy')
    expect(policy.maxRetries).toBe(2)
    expect(policy.maxElapsedMs).toBeUndefined()
    expect(Object.isFrozen(policy)).toBe(true)
  })

  it('ignores normal-only fields retained after switching to always mode', () => {
    const layered = {
      mode: 'always',
      maxRetries: 5,
      retryableCodes: ['SERVER'],
    } as unknown as RetryPolicyConfig

    expect(resolveRetryPolicy(layered, 'provider.retryPolicy')).toEqual({
      mode: 'always',
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
  })

  it.each([
    [{ mode: 'normal', maxRetries: -1 }, /maxRetries/],
    [{ mode: 'normal', maxRetries: 1.5 }, /maxRetries/],
    [{ mode: 'normal', maxRetries: Number.MAX_SAFE_INTEGER + 1 }, /maxRetries/],
    [{ mode: 'always', backoff: { initialDelayMs: 0 } }, /initialDelayMs/],
    [{ mode: 'normal', backoff: { maxDelayMs: Number.POSITIVE_INFINITY } }, /maxDelayMs/],
    [{ mode: 'normal', backoff: { initialDelayMs: MAX_TIMER_DELAY_MS + 1 } }, /initialDelayMs/],
    [{ mode: 'always', backoff: { maxDelayMs: MAX_TIMER_DELAY_MS + 1 } }, /maxDelayMs/],
    [{ mode: 'normal', backoff: { initialDelayMs: 20, maxDelayMs: 10 } }, /less than or equal/],
    [{ mode: 'always', backoff: { jitterRatio: 1.1 } }, /jitterRatio/],
    [{ mode: 'always', budget: { maxRetries: -1 } }, /budget.maxRetries/],
    [{ mode: 'always', budget: { maxRetries: 1.5 } }, /budget.maxRetries/],
    [{ mode: 'always', budget: { maxRetries: Number.MAX_SAFE_INTEGER + 1 } }, /budget.maxRetries/],
    [{ mode: 'always', budget: { maxElapsedMs: -1 } }, /budget.maxElapsedMs/],
    [{ mode: 'always', budget: { maxElapsedMs: 1.5 } }, /budget.maxElapsedMs/],
    [{ mode: 'always', budget: { unknown: 1 } }, /unknown key "unknown"/],
    [{ mode: 'normal', retryableCodes: [] }, /must not be empty/],
    [{ mode: 'normal', retryableCodes: ['SERVER', 'SERVER'] }, /duplicates/],
    [{ mode: 'normal', retryableCodes: [''] }, /non-empty strings/],
    [{ mode: 'normal', retryableCodes: [429] }, /non-empty strings/],
    [{ mode: 'normal', maxRetires: 1 }, /unknown key "maxRetires"/],
    [{ mode: 'always', backoff: { initialDelay: 1 } }, /unknown key "initialDelay"/],
    [{ mode: 'sometimes' }, /mode must be "normal" or "always"/],
  ] as const)('rejects invalid policy %#', (config, message) => {
    expect(() => {
      resolveRetryPolicy(config as unknown as RetryPolicyConfig, 'provider.retryPolicy')
    }).toThrow(message)
  })
})
