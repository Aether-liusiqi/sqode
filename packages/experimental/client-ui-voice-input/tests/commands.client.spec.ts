/** Voice command vocabulary stays exact so dictation is never swallowed. */
import { describe, expect, it } from 'vitest'
import { matchVoiceCommand } from '../src/client/commands.ts'

describe('matchVoiceCommand', () => {
  it.each([
    ['空格', ' '], ['space', ' '],
    ['回车', '\n'], ['换行', '\n'], ['newline', '\n'], ['Enter', '\n'],
    ['句号', '。'], ['period', '。'],
    ['逗号', '，'], ['comma', '，'],
    ['冒号', '：'], ['colon', '：'],
    ['双引号', '"'], ['quote', '"'],
    ['问号', '？'], ['question mark', '？'],
    ['感叹号', '！'], ['exclamation mark', '！'],
    ['分号', '；'], ['semicolon', '；'],
    ['顿号', '、'],
  ])('inserts %s as %j', (spoken, expected) => {
    expect(matchVoiceCommand(spoken)).toEqual({ kind: 'insert', text: expected })
  })

  it.each([
    ['退格', '你好世', '你好。世'], ['删除', '你好世', '你好。世'], ['删除最后一个字', '你好世', '你好。世'], ['Backspace', '你好世', '你好。世'],
    ['删除整句', '', '你好。'], ['delete sentence', '', '你好。'],
    ['删除全部', '', ''], ['清空', '', ''], ['delete all', '', ''], ['clear all', '', ''],
  ])('deletes for %s', (spoken, expected, expectedWithPunctuation) => {
    const command = matchVoiceCommand(spoken)
    expect(command?.kind).toBe('delete')
    if (command?.kind === 'delete') expect(command.apply('你好世界')).toBe(expected)
    if (command?.kind === 'delete') expect(command.apply('你好。世界')).toBe(expectedWithPunctuation)
  })

  it('matches after trimming and dropping trailing punctuation', () => {
    expect(matchVoiceCommand('  空格。')).toEqual({ kind: 'insert', text: ' ' })
    expect(matchVoiceCommand('换行！')).toEqual({ kind: 'insert', text: '\n' })
    expect(matchVoiceCommand('delete all.')).toEqual({ kind: 'delete', apply: expect.any(Function) })
  })

  it('leaves ordinary dictation unmatched', () => {
    expect(matchVoiceCommand('今天的天气不错')).toBeNull()
    expect(matchVoiceCommand('这里空格在哪里')).toBeNull()
    expect(matchVoiceCommand('')).toBeNull()
    expect(matchVoiceCommand('  ')).toBeNull()
  })

  it('keeps text through the last punctuation when deleting a sentence', () => {
    const command = matchVoiceCommand('删除整句')
    expect(command?.kind === 'delete' && command.apply('你好世界')).toBe('')
    expect(command?.kind === 'delete' && command.apply('你好。世界')).toBe('你好。')
    expect(command?.kind === 'delete' && command.apply('第一行\n第二行')).toBe('第一行\n')
  })

  it.each([
    ['请退格', 'delete'], ['帮我删除', 'delete'], ['麻烦删除全部吧', 'delete'],
    ['请换行一下', 'insert'], ['please delete', 'delete'], ['删除整句吧', 'delete'],
  ])('recognizes the polite lead-in form %s', (spoken, kind) => {
    expect(matchVoiceCommand(spoken)?.kind).toBe(kind)
  })

  it('does not swallow command words used mid-sentence', () => {
    expect(matchVoiceCommand('文档里怎么换行')).toBeNull()
    expect(matchVoiceCommand('帮我删除这句话')).toBeNull()
    expect(matchVoiceCommand('请问要退格吗')).toBeNull()
  })
})
