// The card store (design.md §3.1). Owns the Card[] and the one invariant
// that makes the product honest: `commitScript` parses first and refuses
// anything that does not parse, so `Card.script` always holds a script that
// parsed, and nothing else ever writes it.
import { parse } from '../parser'
import { loadCards, saveCards, type StorageLike } from './persistence'
import { seedCards } from './seed'
import type { Card, CardStore, CommitResult, StoreChange, WriteResult } from './types'

export interface CardStoreOptions {
  /** The cards to start from, in stack order. */
  readonly initial: readonly Card[]
  /**
   * Called for every change with the full, sorted array the change would leave,
   * before the store takes it over. If it throws, the change is not made
   * (design.md §3.1, requirement 8.1).
   */
  readonly persist?: (cards: readonly Card[]) => void
  /** The bundled cards, for `resetToSeed`. Defaults to `initial`. */
  readonly seed?: () => readonly Card[]
  /** Injectable clock. */
  readonly now?: () => Date
}

export function createCardStore(options: CardStoreOptions): CardStore {
  let cards: Card[] = sorted(options.initial)
  const listeners = new Set<(change: StoreChange) => void>()
  const now = options.now ?? (() => new Date())
  const persist = options.persist ?? (() => undefined)
  const seed = options.seed ?? (() => options.initial)

  /**
   * Delivers `change` to the subscribers the store has now (design.md §3.1). A
   * subscriber may subscribe others or unsubscribe them while it handles the
   * change (re-running a card can replace its view, §5.6): one added meanwhile
   * gets the next change, and one removed meanwhile is not called.
   */
  function notify(change: StoreChange): void {
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(change)
    }
  }

  function require(id: string): { card: Card; index: number } {
    const index = cards.findIndex((c) => c.id === id)
    const card = cards[index]
    if (card === undefined) throw new Error(`no card with id "${id}"`)
    return { card, index }
  }

  /**
   * Writes `next` and, only when the write went through, makes it the store's
   * cards. A refused write leaves `cards` as it was and returns false.
   */
  function write(next: Card[]): boolean {
    try {
      persist(next)
    } catch {
      return false
    }
    cards = next
    return true
  }

  function replace(index: number, card: Card): boolean {
    return write(cards.map((c, i) => (i === index ? card : c)))
  }

  return {
    getCards: () => cards,
    getCard: (id) => cards.find((c) => c.id === id),
    getCardByNumber: (n) => cards.find((c) => c.number === n),

    saveDescription(id, description): WriteResult {
      const { card, index } = require(id)
      if (!replace(index, { ...card, description, updatedAt: now().toISOString() })) return { ok: false, reason: 'storage' }
      notify({ kind: 'description', id })
      return { ok: true }
    },

    commitScript(id, script, origin): CommitResult {
      const { card, index } = require(id)
      const result = parse(script)
      if (!result.ok) return { ok: false, reason: 'parse', error: result.error, card }
      const updated: Card = { ...card, script, scriptOrigin: origin, updatedAt: now().toISOString() }
      if (!replace(index, updated)) return { ok: false, reason: 'storage', card }
      notify({ kind: 'script', id })
      return { ok: true, card: updated }
    },

    resetToSeed(): WriteResult {
      if (!write(sorted(seed()))) return { ok: false, reason: 'storage' }
      notify({ kind: 'reset' })
      return { ok: true }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function sorted(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => a.number - b.number)
}

export interface OpenCardStoreOptions {
  readonly storage: StorageLike
  readonly now?: () => Date
}

/**
 * The app's store: loads `hcr.cards.v1`, seeds from the bundled examples when
 * the key is missing or invalid (and overwrites it), and persists every change.
 */
export function openCardStore(options: OpenCardStoreOptions): CardStore {
  const now = options.now ?? (() => new Date())
  const seed = (): readonly Card[] => seedCards(now())
  let initial = loadCards(options.storage)
  if (initial === null) {
    initial = seed()
    saveCards(options.storage, initial)
  }
  return createCardStore({
    initial,
    seed,
    now,
    persist: (cards) => {
      saveCards(options.storage, cards)
    },
  })
}
