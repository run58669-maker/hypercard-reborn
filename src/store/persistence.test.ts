import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { openCardStore } from './cardStore'
import { CARDS_KEY, isCard, loadCards, saveCards, type StorageLike } from './persistence'
import { seedCards } from './seed'

const NOW = new Date('2026-11-01T15:04:00.000Z')

/** A Map-backed localStorage. */
function fakeStorage(entries: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

describe('seedCards', () => {
  it('builds the six bundled cards with kind seed and the example bytes', () => {
    const cards = seedCards(NOW)
    expect(cards.map((c) => [c.id, c.number, c.name])).toEqual([
      ['hello', 1, 'Hello'],
      ['counter', 2, 'Counter'],
      ['date-stamp', 3, 'Date stamp'],
      ['greeter', 4, 'Greeter'],
      ['countdown', 5, 'Countdown'],
      ['quiz', 6, 'Quiz'],
    ])
    for (const [i, card] of cards.entries()) {
      const example = EXAMPLES[i]
      expect(card.scriptOrigin).toEqual({ kind: 'seed' })
      expect(card.script).toBe(example?.script)
      expect(card.description).toBe(example?.description)
      expect(card.objects).toEqual(example?.objects)
      expect(card.updatedAt).toBe(NOW.toISOString())
    }
  })
})

describe('openCardStore', () => {
  it('seeds six cards and writes the key when storage is empty', () => {
    const storage = fakeStorage()
    const store = openCardStore({ storage, now: () => NOW })
    expect(store.getCards()).toHaveLength(6)
    expect(store.getCards().every((c) => c.scriptOrigin.kind === 'seed')).toBe(true)
    expect(storage.map.has(CARDS_KEY)).toBe(true)
    expect(loadCards(storage)).toEqual(store.getCards())
  })

  it.each([
    ['not JSON', '{nope'],
    ['not an array', '{"a":1}'],
    ['an array of non-cards', '[{"id":"x"}]'],
    ['a card with a non-string script', JSON.stringify([{ ...seedCards(NOW)[0], script: 42 }])],
    ['a card with a bad origin', JSON.stringify([{ ...seedCards(NOW)[0], scriptOrigin: { kind: 'magic' } }])],
    ['a card with a bad object', JSON.stringify([{ ...seedCards(NOW)[0], objects: [{ kind: 'field' }] }])],
  ])('re-seeds and overwrites when the key holds %s', (_label, raw) => {
    const storage = fakeStorage({ [CARDS_KEY]: raw })
    const store = openCardStore({ storage, now: () => NOW })
    expect(store.getCards()).toEqual(seedCards(NOW))
    expect(storage.map.get(CARDS_KEY)).toBe(JSON.stringify(seedCards(NOW)))
  })

  it('loads valid data unchanged', () => {
    const storage = fakeStorage()
    const edited = 'on openCard\n  put "edited" into field "greeting"\nend openCard\n'
    const first = openCardStore({ storage, now: () => NOW })
    first.commitScript('hello', edited, { kind: 'edited', at: NOW.toISOString() })
    first.saveDescription('counter', 'changed')
    const snapshot = structuredClone(first.getCards())

    const second = openCardStore({ storage, now: () => new Date('2030-01-01T00:00:00.000Z') })
    expect(second.getCards()).toEqual(snapshot)
    expect(second.getCard('hello')?.script).toBe(edited)
    expect(storage.map.get(CARDS_KEY)).toBe(JSON.stringify(snapshot))
  })

  it('resetToSeed restores the bundled script after an edit and notifies', () => {
    const storage = fakeStorage()
    const store = openCardStore({ storage, now: () => NOW })
    const changes: string[] = []
    store.subscribe((c) => changes.push(c.kind))
    store.commitScript('hello', '', { kind: 'edited', at: NOW.toISOString() })
    expect(store.getCard('hello')?.script).toBe('')
    store.resetToSeed()
    expect(store.getCard('hello')?.script).toBe(EXAMPLES[0]?.script)
    expect(store.getCards()).toEqual(seedCards(NOW))
    expect(changes).toEqual(['script', 'reset'])
    expect(loadCards(storage)).toEqual(seedCards(NOW))
  })

  it('treats a throwing storage as empty', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(loadCards(storage)).toBeNull()
  })
})

describe('isCard', () => {
  it('accepts every seeded card and the compiled and edited origins', () => {
    const base = seedCards(NOW)[0]
    expect(isCard(base)).toBe(true)
    expect(isCard({ ...base, scriptOrigin: { kind: 'edited', at: 'x' } })).toBe(true)
    expect(isCard({ ...base, scriptOrigin: { kind: 'compiled', provider: 'canned', descriptionHash: 'h', at: 'x' } })).toBe(true)
    expect(isCard({ ...base, scriptOrigin: { kind: 'compiled', provider: 'anthropic', model: 'm', descriptionHash: 'h', at: 'x' } })).toBe(true)
  })

  it('rejects a compiled origin without a hash', () => {
    const base = seedCards(NOW)[0]
    expect(isCard({ ...base, scriptOrigin: { kind: 'compiled', provider: 'canned', at: 'x' } })).toBe(false)
  })

  it('round-trips a script through JSON byte for byte', () => {
    const storage = fakeStorage()
    const script = 'on openCard\r\n  put "é😀 \t" into field "greeting"\r\nend openCard'
    const cards = seedCards(NOW).map((c) => (c.id === 'hello' ? { ...c, script } : c))
    saveCards(storage, cards)
    expect(loadCards(storage)?.[0]?.script).toBe(script)
  })
})
