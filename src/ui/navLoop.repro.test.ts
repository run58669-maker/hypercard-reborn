// @vitest-environment jsdom
// Reproduction only (2026-11-26): does a script that keeps sending the stack
// to a card, or one nested very deep, throw? Seven of the eight cases do, so
// they are marked `it.fails` (the assertion is the behaviour we want). Tasks
// 18.1 and 18.2 move the cases into the real test files and delete this one.
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from '../parser'
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

describe('reproduction: deep nesting in the parser', () => {
  for (const depth of [100, 1000, 5000, 20000]) {
    const test = depth === 100 ? it : it.fails
    test(`parentheses nested ${String(depth)} deep`, () => {
      const source = `on mouseUp\n  put ${'('.repeat(depth)}1${')'.repeat(depth)} into x\nend mouseUp`
      const result = outcome(() => { parse(source) })
      console.log(`PARENS_${String(depth)} ->`, result)
      expect(result).toBe('returned')
    })
  }

  it.fails('unary minus repeated 20000 times', () => {
    const source = `on mouseUp\n  put ${'- '.repeat(20000)}1 into x\nend mouseUp`
    const result = outcome(() => { parse(source) })
    console.log('MINUS_20000 ->', result)
    expect(result).toBe('returned')
  })

  it.fails('if blocks nested 3000 deep', () => {
    const depth = 3000
    const source = `on mouseUp\n${'if true then\n'.repeat(depth)}put 1 into x\n${'end if\n'.repeat(depth)}end mouseUp`
    const result = outcome(() => { parse(source) })
    console.log('IF_3000 ->', result)
    expect(result).toBe('returned')
  })
})
