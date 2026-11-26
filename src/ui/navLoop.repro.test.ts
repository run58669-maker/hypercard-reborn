// @vitest-environment jsdom
// Reproduction only (2026-11-26): does a script that keeps sending the stack
// to a card throw? Both cases do, so they are marked `it.fails` (the assertion
// is the behaviour we want). The deep-nesting cases moved to
// src/parser/nesting.test.ts in task 18.1; task 18.2 moves these two into the
// real test files and deletes this one.
import { afterEach, describe, expect, it } from 'vitest'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { createApp } from './app'

const NOW = new Date(2026, 10, 1, 15, 4)

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

function appWith(scripts: Record<number, string>) {
  const cards = seedCards(NOW).map((card, index) => {
    const script = scripts[index + 1]
    return script === undefined ? card : { ...card, script }
  })
  const store = createCardStore({ initial: cards, now: () => NOW })
  const runtime = createCardRuntime({ cardCount: () => store.getCards().length, onNavigate: (n) => { app.go(n) }, now: () => NOW })
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const app = createApp(root, {
    store,
    runtime,
    storage: fakeStorage(),
    now: () => NOW,
    loadCompiler: () => Promise.reject(new Error('compiler not loaded in this test')),
  })
  return { app, root }
}

afterEach(() => {
  document.body.replaceChildren()
})

function outcome(fn: () => void): string {
  try {
    fn()
    return 'returned'
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
}

describe('reproduction: scripted navigation loops', () => {
  it.fails('card 1 openCard sends the stack to card 1', () => {
    const { app } = appWith({ 1: 'on openCard\n  go to card 1\nend openCard' })
    const result = outcome(() => { app.go(1) })
    console.log('SELF_LOOP ->', result)
    expect(result).toBe('returned')
  })

  it.fails('card 1 and card 2 send the stack to each other', () => {
    const { app } = appWith({
      1: 'on openCard\n  go to card 2\nend openCard',
      2: 'on openCard\n  go to card 1\nend openCard',
    })
    const result = outcome(() => { app.go(1) })
    console.log('PING_PONG ->', result)
    expect(result).toBe('returned')
  })
})
