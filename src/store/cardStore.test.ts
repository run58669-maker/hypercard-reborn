import { describe, expect, it, vi } from 'vitest'
import { createCardStore } from './cardStore'
import type { Card, StoreChange } from './types'

const NOW = new Date('2026-11-01T15:04:00.000Z')

function card(id: string, number: number, script = ''): Card {
  return {
    id,
    number,
    name: id,
    description: `card ${id}`,
    script,
    scriptOrigin: { kind: 'seed' },
    objects: [{ kind: 'field', name: 'f', visible: true, text: '', rect: { x: 0, y: 0, w: 10, h: 10 } }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const VALID = 'on openCard\n  put 1 into field "f"\nend openCard\n'
const INVALID = 'on openCard\n  put 1 into field "f"\nend mouseUp\n'

function store(initial = [card('b', 2, VALID), card('a', 1)]) {
  const persist = vi.fn()
  const changes: StoreChange[] = []
  const s = createCardStore({ initial, persist, now: () => NOW })
  s.subscribe((change) => changes.push(change))
  return { store: s, persist, changes }
}

describe('commitScript', () => {
  it('leaves the card deep-equal to before and emits no change when the script does not parse', () => {
    const { store: s, persist, changes } = store()
    const before = structuredClone(s.getCard('a'))
    const result = s.commitScript('a', INVALID, { kind: 'edited', at: NOW.toISOString() })
    expect(result).toMatchObject({ ok: false, card: before })
    if (!result.ok) {
      expect(result.error).toEqual({ line: 3, column: 5, message: 'expected "end openCard", found "end mouseUp"', near: 'end mouseUp' })
    }
    expect(s.getCard('a')).toEqual(before)
    expect(s.getCards()).toEqual([before, s.getCard('b')])
    expect(changes).toEqual([])
    expect(persist).not.toHaveBeenCalled()
  })

  it('stores the script verbatim on success and notifies once', () => {
    const { store: s, persist, changes } = store()
    const script = 'on openCard\r\n  put "x" into field "f"  \r\nend openCard'
    const origin = { kind: 'edited', at: NOW.toISOString() } as const
    const result = s.commitScript('a', script, origin)
    expect(result.ok).toBe(true)
    expect(s.getCard('a')).toMatchObject({ script, scriptOrigin: origin, updatedAt: NOW.toISOString() })
    expect(s.getCard('a')?.script).toBe(script)
    expect(changes).toEqual([{ kind: 'script', id: 'a' }])
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith(s.getCards())
  })

  it('accepts the empty script', () => {
    const { store: s } = store()
    expect(s.commitScript('b', '', { kind: 'edited', at: NOW.toISOString() }).ok).toBe(true)
    expect(s.getCard('b')?.script).toBe('')
  })

  it('throws for an unknown card id', () => {
    const { store: s } = store()
    expect(() => s.commitScript('zzz', '', { kind: 'seed' })).toThrow('no card with id "zzz"')
  })
})

describe('saveDescription', () => {
  it('changes the description and updatedAt but never the script', () => {
    const { store: s, changes } = store()
    s.saveDescription('b', 'new words')
    expect(s.getCard('b')).toMatchObject({ description: 'new words', script: VALID, updatedAt: NOW.toISOString() })
    expect(changes).toEqual([{ kind: 'description', id: 'b' }])
  })
})

describe('getCards', () => {
  it('returns the cards sorted by number', () => {
    const { store: s } = store()
    expect(s.getCards().map((c) => c.id)).toEqual(['a', 'b'])
  })
})
