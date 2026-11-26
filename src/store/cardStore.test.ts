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
    expect(result).toMatchObject({ ok: false, reason: 'parse', card: before })
    if (!result.ok && result.reason === 'parse') {
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

  // Task 18.3, design.md §3.1: a change goes to the subscribers the store had
  // when it was made. Iterating the live set let a view that was created while
  // a commit was being delivered re-run the card again, without end (§5.6).
  it('does not deliver a change to a subscriber added while it is being delivered', () => {
    const { store: s } = store()
    const late: StoreChange[] = []
    let added = 0
    s.subscribe(() => {
      added += 1
      if (added > 10) throw new Error('the change keeps being delivered to new subscribers')
      s.subscribe((c) => late.push(c))
    })
    s.saveDescription('a', 'd')
    expect(late).toEqual([])
    expect(added).toBe(1)
    s.saveDescription('a', 'e')
    expect(late).toEqual([{ kind: 'description', id: 'a' }])
  })

  it('does not call a subscriber that an earlier one removed during delivery', () => {
    const { store: s } = store()
    const calls: string[] = []
    const stops: Array<() => void> = []
    s.subscribe(() => {
      calls.push('first')
      stops.forEach((stop) => { stop() })
    })
    stops.push(s.subscribe(() => calls.push('second')))
    s.subscribe(() => calls.push('third'))
    s.saveDescription('a', 'd')
    expect(calls).toEqual(['first', 'third'])
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

// Task 19.1, requirement 8.1: the store writes first and changes its cards
// second, so a write that storage refuses leaves no trace (design.md §3.1).
describe('a write that storage refuses', () => {
  function refusing() {
    const state = { full: true }
    const written: string[] = []
    const changes: StoreChange[] = []
    const s = createCardStore({
      initial: [card('b', 2, VALID), card('a', 1)],
      seed: () => [card('a', 1, VALID), card('b', 2)],
      now: () => NOW,
      persist: (cards) => {
        if (state.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        written.push(JSON.stringify(cards))
      },
    })
    s.subscribe((change) => changes.push(change))
    return { store: s, state, written, changes }
  }

  it('commitScript returns reason storage, keeps the very same cards and notifies nobody', () => {
    const { store: s, written, changes } = refusing()
    const cards = s.getCards()
    const before = s.getCard('a')
    const result = s.commitScript('a', VALID, { kind: 'edited', at: NOW.toISOString() })
    expect(result).toEqual({ ok: false, reason: 'storage', card: before })
    expect(s.getCards()).toBe(cards)
    expect(s.getCard('a')).toBe(before)
    expect(s.getCard('a')?.script).toBe('')
    expect(changes).toEqual([])
    expect(written).toEqual([])
  })

  it('saveDescription returns reason storage, keeps the very same cards and notifies nobody', () => {
    const { store: s, changes } = refusing()
    const cards = s.getCards()
    expect(s.saveDescription('a', 'new words')).toEqual({ ok: false, reason: 'storage' })
    expect(s.getCards()).toBe(cards)
    expect(s.getCard('a')?.description).toBe('card a')
    expect(changes).toEqual([])
  })

  it('resetToSeed returns reason storage, keeps the very same cards and notifies nobody', () => {
    const { store: s, changes } = refusing()
    const cards = s.getCards()
    expect(s.resetToSeed()).toEqual({ ok: false, reason: 'storage' })
    expect(s.getCards()).toBe(cards)
    expect(s.getCard('b')?.script).toBe(VALID)
    expect(changes).toEqual([])
  })

  it('a parse error is still reported as a parse error when storage is full, and nothing is written', () => {
    const { store: s, written } = refusing()
    expect(s.commitScript('a', INVALID, { kind: 'edited', at: NOW.toISOString() })).toMatchObject({ ok: false, reason: 'parse' })
    expect(written).toEqual([])
  })

  it('makes each change once storage takes the write again, and reports ok', () => {
    const { store: s, state, written, changes } = refusing()
    s.commitScript('a', VALID, { kind: 'edited', at: NOW.toISOString() })
    state.full = false
    expect(s.saveDescription('a', 'new words')).toEqual({ ok: true })
    expect(s.commitScript('a', VALID, { kind: 'edited', at: NOW.toISOString() }).ok).toBe(true)
    expect(s.getCard('a')).toMatchObject({ description: 'new words', script: VALID })
    expect(written).toHaveLength(2)
    expect(written[1]).toBe(JSON.stringify(s.getCards()))
    expect(s.resetToSeed()).toEqual({ ok: true })
    expect(s.getCard('b')?.script).toBe('')
    expect(changes).toEqual([{ kind: 'description', id: 'a' }, { kind: 'script', id: 'a' }, { kind: 'reset' }])
  })

  it('hands persist the cards the change would leave, before it takes them over', () => {
    const seen: Array<{ next: string | undefined; current: string | undefined }> = []
    const s = createCardStore({
      initial: [card('a', 1)],
      now: () => NOW,
      persist: (cards) => {
        seen.push({ next: cards[0]?.script, current: s.getCard('a')?.script })
      },
    })
    s.commitScript('a', VALID, { kind: 'edited', at: NOW.toISOString() })
    expect(seen).toEqual([{ next: VALID, current: '' }])
  })
})
