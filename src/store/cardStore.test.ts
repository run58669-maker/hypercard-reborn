import { describe, expect, it, vi } from 'vitest'
import { createCardStore } from './cardStore'
import { seedCards } from './seed'
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

describe('getCardByNumber', () => {
  it('finds cards 1..6 of the seeded stack and nothing for 7 or 0', () => {
    const { store: s } = store([...seedCards(NOW)])
    for (let n = 1; n <= 6; n += 1) {
      expect(s.getCardByNumber(n)?.number).toBe(n)
    }
    expect(s.getCardByNumber(1)?.id).toBe('hello')
    expect(s.getCardByNumber(6)?.id).toBe('quiz')
    expect(s.getCardByNumber(7)).toBeUndefined()
    expect(s.getCardByNumber(0)).toBeUndefined()
  })
})

describe('change notifications', () => {
  it('carry the right kind and id for each change, and stop after unsubscribe', () => {
    const { store: s, changes } = store()
    const seen: StoreChange[] = []
    const unsubscribe = s.subscribe((c) => seen.push(c))
    s.saveDescription('a', 'd')
    s.commitScript('a', VALID, { kind: 'edited', at: NOW.toISOString() })
    s.commitScript('a', INVALID, { kind: 'edited', at: NOW.toISOString() })
    s.resetToSeed()
    unsubscribe()
    s.saveDescription('a', 'e')
    expect(seen).toEqual([{ kind: 'description', id: 'a' }, { kind: 'script', id: 'a' }, { kind: 'reset' }])
    expect(changes).toHaveLength(4)
  })
})

describe('commit success', () => {
  it('updates script, scriptOrigin and updatedAt, persists once, and keeps other fields', () => {
    const { store: s, persist } = store()
    const before = s.getCard('b') as Card
    const origin = { kind: 'compiled', provider: 'canned', descriptionHash: 'abc', at: NOW.toISOString() } as const
    const result = s.commitScript('b', '', origin)
    expect(result).toEqual({ ok: true, card: { ...before, script: '', scriptOrigin: origin, updatedAt: NOW.toISOString() } })
    expect(s.getCard('b')).toEqual(result.ok ? result.card : undefined)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0]?.[0]).toEqual(s.getCards())
  })

  it('returns a new card object and leaves the previous snapshot untouched', () => {
    const { store: s } = store()
    const before = s.getCard('b') as Card
    s.commitScript('b', '', { kind: 'edited', at: NOW.toISOString() })
    expect(before.script).toBe(VALID)
    expect(s.getCard('b')).not.toBe(before)
  })
})
