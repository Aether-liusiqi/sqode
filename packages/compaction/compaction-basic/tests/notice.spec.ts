import { describe, expect, it } from 'vitest'

import { fallbackNotice, noticeDirective, remainingRunway } from '../src/notice.ts'
import type { NoticeFacts } from '../src/notice.ts'

const FACTS: NoticeFacts = {
  usedTokens: 67_000,
  contextWindow: 100_000,
  thresholdTokens: 75_000,
  inToolLoop: true,
  compactionsThisTurn: 0,
  lastRequest: '把随机过程那章的推导补完',
  pendingWork: ['补完第三章推导', '导出 PDF'],
}

describe('wrap-up notice', () => {
  it('reports the runway left before compaction', () => {
    expect(remainingRunway(FACTS)).toBe(8_000)
  })

  it('hands the generator the facts it cannot infer', () => {
    const directive = noticeDirective(FACTS)
    // The steps available and the unfinished work are what make the notice
    // specific instead of "context is nearly full".
    expect(directive).toContain('67000 of 100000')
    expect(directive).toContain('about 8000 tokens')
    expect(directive).toContain('补完第三章推导')
    expect(directive).toContain('导出 PDF')
    expect(directive).toContain('把随机过程那章的推导补完')
    expect(directive).toContain('at most two sentences')
  })

  it('says so when no unfinished work was recorded', () => {
    const directive = noticeDirective({ ...FACTS, pendingWork: [] })
    expect(directive).toContain('(none recorded)')
  })

  it('still tells the operator what is left when generation fails', () => {
    const notice = fallbackNotice(FACTS)
    expect(notice).toContain('67%')
    expect(notice).toContain('2 步')
    expect(notice).toContain('补完第三章推导')
  })
})
