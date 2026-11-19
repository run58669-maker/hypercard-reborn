// localStorage persistence (design.md §3): the Card[] is JSON in
// `hcr.cards.v1`. JSON string encoding is lossless, so `script` survives the
// round trip byte for byte. A missing key, invalid JSON or a failed schema
// check means "re-seed and overwrite".
import type { Card, CardObject, ScriptOrigin } from './types'

export const CARDS_KEY = 'hcr.cards.v1'

/** The subset of the Web Storage API the store uses; tests pass a Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** The stored cards, or `null` when the key is missing or does not pass the schema check. */
export function loadCards(storage: StorageLike): readonly Card[] | null {
  let raw: string | null
  try {
    raw = storage.getItem(CARDS_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return isCardArray(parsed) ? parsed : null
}

export function saveCards(storage: StorageLike, cards: readonly Card[]): void {
  storage.setItem(CARDS_KEY, JSON.stringify(cards))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRect(value: unknown): value is CardObject['rect'] {
  return (
    isRecord(value) &&
    typeof value['x'] === 'number' &&
    typeof value['y'] === 'number' &&
    typeof value['w'] === 'number' &&
    typeof value['h'] === 'number'
  )
}

function isCardObject(value: unknown): value is CardObject {
  if (!isRecord(value)) return false
  if (value['kind'] !== 'field' && value['kind'] !== 'button') return false
  if (typeof value['name'] !== 'string' || typeof value['visible'] !== 'boolean') return false
  if (value['enabled'] !== undefined && typeof value['enabled'] !== 'boolean') return false
  if (value['text'] !== undefined && typeof value['text'] !== 'string') return false
  return isRect(value['rect'])
}

function isScriptOrigin(value: unknown): value is ScriptOrigin {
  if (!isRecord(value)) return false
  switch (value['kind']) {
    case 'seed':
      return true
    case 'edited':
      return typeof value['at'] === 'string'
    case 'compiled':
      return (
        (value['provider'] === 'anthropic' || value['provider'] === 'canned') &&
        typeof value['descriptionHash'] === 'string' &&
        typeof value['at'] === 'string' &&
        (value['model'] === undefined || typeof value['model'] === 'string')
      )
    default:
      return false
  }
}

export function isCard(value: unknown): value is Card {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['number'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['description'] === 'string' &&
    typeof value['script'] === 'string' &&
    isScriptOrigin(value['scriptOrigin']) &&
    Array.isArray(value['objects']) &&
    value['objects'].every(isCardObject) &&
    typeof value['updatedAt'] === 'string'
  )
}

export function isCardArray(value: unknown): value is Card[] {
  return Array.isArray(value) && value.every(isCard)
}
