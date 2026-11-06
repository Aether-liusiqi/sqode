import { createUserMessage } from '@liusiqi-dev/sqh-llm'
import { describe, expect, it } from 'vitest'

import {
  composeNotice, dueForNotice, fallbackNotice, latestUserRequest, noticeDirective, noticeUserMessage,
  remainingRunway,
} from '../src/notice.ts'
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

  it('uses the generated notice when the model answers', async () => {
    const notice = await composeNotice(FACTS, async (directive) => {
      expect(directive).toContain('补完第三章推导')
      return '还剩约两步；建议先把这一章收尾，导出 PDF 留到下一轮。'
    })
    expect(notice).toContain('导出 PDF')
  })

  it('falls back when generation throws', async () => {
    const notice = await composeNotice(FACTS, () => Promise.reject(new Error('provider down')))
    expect(notice).toContain('67%')
    expect(notice).toContain('补完第三章推导')
  })

  it('falls back when generation returns nothing usable', async () => {
    const notice = await composeNotice(FACTS, () => Promise.resolve('   '))
    expect(notice).toContain('67%')
  })

  it('shows the notice only in the window between the warning point and compaction', () => {
    const gate = { thresholdTokens: 75_000, alreadyNoticed: false, compacting: false }
    // Below 67,000 there is still runway; at 75,000 compaction takes over.
    expect(dueForNotice({ ...gate, usedTokens: 60_000 })).toBe(false)
    expect(dueForNotice({ ...gate, usedTokens: 67_000 })).toBe(true)
    expect(dueForNotice({ ...gate, usedTokens: 74_000 })).toBe(true)
  })

  it('never repeats within a turn or during a compaction', () => {
    const gate = { usedTokens: 74_000, thresholdTokens: 75_000 }
    expect(dueForNotice({ ...gate, alreadyNoticed: true, compacting: false })).toBe(false)
    expect(dueForNotice({ ...gate, alreadyNoticed: false, compacting: true })).toBe(false)
  })

  it('quotes the latest thing the operator typed, not synthetic context', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: '先做第三章' }] },
      { role: 'assistant', content: [{ type: 'text', text: '好' }] },
      { role: 'user', content: [{ type: 'text', text: '再看第四章' }] },
    ]
    expect(latestUserRequest(messages)).toBe('再看第四章')
  })

  it('reports no request rather than inventing one', () => {
    expect(latestUserRequest([{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }])).toBe('')
  })

  it('marks the notice so the transcript can tell it apart', () => {
    const message = noticeUserMessage('上下文已用 67%')
    expect(message.role).toBe('user')
    expect(message.source.kind).toBe('compaction-notice')
    expect(JSON.stringify(message.content)).toContain('67%')
  })

  it('builds the message agent.inject accepts: id present, kind registered', () => {
    // The two things that made injection fail: a UserMessage needs an id, and the
    // source kind must be registered on MessageSourceMap. Both are checked here on
    // the exact object the engine hands over.
    const built = noticeUserMessage('上下文已用 67%')
    const message = createUserMessage({ content: built.content, source: built.source })
    expect(message.id).toBeTruthy()
    expect(message.role).toBe('user')
    expect(message.source.kind).toBe('compaction-notice')
    expect(Object.isFrozen(message)).toBe(true)
  })
})
