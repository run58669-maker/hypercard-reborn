import { describe, expect, it } from 'vitest'
import { FakeHost } from './fakeHost'

const NOW = new Date(2026, 10, 1, 15, 4)

describe('FakeHost', () => {
  it('seeds objects from the layout with defaults', () => {
    const host = new FakeHost(
      [
        { kind: 'field', name: 'count', visible: true },
        { kind: 'button', name: 'Increment', visible: true },
      ],
      NOW,
    )
    expect(host.object('field', 'count')).toEqual({ kind: 'field', name: 'count', visible: true, enabled: true, text: '' })
    expect(host.object('button', 'increment')).toMatchObject({ name: 'Increment', enabled: true })
  })

  it('finds a renamed object under the new name only and records the exact call sequence', () => {
    const host = new FakeHost(
      [
        { kind: 'field', name: 'name', visible: true, text: 'Ada' },
        { kind: 'button', name: 'Greet', visible: true },
      ],
      NOW,
    )
    expect(host.setName('button', 'greet', 'Wave')).toBe(true)
    expect(host.hasObject('button', 'Greet')).toBe(false)
    expect(host.hasObject('button', 'WAVE')).toBe(true)
    expect(host.getName('button', 'wave')).toBe('Wave')
    expect(host.getFieldText('NAME')).toBe('Ada')
    expect(host.calls).toEqual([
      { method: 'setName', args: ['button', 'greet', 'Wave'] },
      { method: 'hasObject', args: ['button', 'Greet'] },
      { method: 'hasObject', args: ['button', 'WAVE'] },
      { method: 'getName', args: ['button', 'wave'] },
      { method: 'getFieldText', args: ['NAME'] },
    ])
  })

  it('matches names case-insensitively but keeps kinds apart', () => {
    const host = new FakeHost([{ kind: 'field', name: 'x', visible: true }], NOW)
    expect(host.hasObject('field', 'X')).toBe(true)
    expect(host.hasObject('button', 'x')).toBe(false)
    expect(host.setFieldText('X', 'hi')).toBe(true)
    expect(host.getFieldText('x')).toBe('hi')
  })

  it('returns false for every write to a missing object', () => {
    const host = new FakeHost([], NOW)
    expect(host.setFieldText('f', 't')).toBe(false)
    expect(host.setVisible('field', 'f', true)).toBe(false)
    expect(host.setEnabled('b', false)).toBe(false)
    expect(host.setName('button', 'b', 'c')).toBe(false)
    expect(host.getFieldText('f')).toBeUndefined()
    expect(host.getName('button', 'b')).toBeUndefined()
  })

  it('updates visibility and enabled state', () => {
    const host = new FakeHost([{ kind: 'button', name: 'Go', visible: true }], NOW)
    expect(host.setVisible('button', 'go', false)).toBe(true)
    expect(host.setEnabled('go', false)).toBe(true)
    expect(host.object('button', 'Go')).toMatchObject({ visible: false, enabled: false })
  })

  it('collects dialogs, messages and in-range navigations', () => {
    const host = new FakeHost([], NOW)
    host.answer('Correct!')
    host.message('hello')
    expect(host.goToCard(2)).toBe(true)
    expect(host.goToCard(7)).toBe(false)
    expect(host.goToCard(0)).toBe(false)
    expect(host.dialogs).toEqual(['Correct!'])
    expect(host.messages).toEqual(['hello'])
    expect(host.navigations).toEqual([2])
  })

  it('returns the fixed clock', () => {
    const host = new FakeHost([], NOW)
    expect(host.now()).toBe(NOW)
    expect(host.calls).toEqual([{ method: 'now', args: [] }])
  })
})
