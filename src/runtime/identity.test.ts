// @vitest-environment jsdom
// Requirement 2.2 at the store/runtime seam (design.md §7.4): the program the
// runtime executes has `source` === the stored script, as a reference and as
// UTF-8 bytes.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbProgram } from '../parser/arbitraries'
import { print } from '../parser/printer'
import { createCardStore, seedCards } from '../store'
import { createCardRuntime, type CardMount } from './cardRuntime'

const NOW = new Date(2026, 10, 1, 15, 4)
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

function mount(): CardMount {
  const make = () => document.createElement('div')
  return { canvas: make(), statusLine: make(), messageBox: make(), dialogRoot: make() }
}

function setup() {
  const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
  const runtime = createCardRuntime({ cardCount: () => store.getCards().length, onNavigate: () => undefined, now: () => NOW })
  return { store, runtime }
}

describe('byte identity', () => {
  it.each(seedCards(NOW).map((c) => [c.id] as const))('%s: currentProgram(id).source === getCard(id).script', (id) => {
    const { store, runtime } = setup()
    const card = store.getCard(id)
    if (card === undefined) throw new Error(`no card ${id}`)
    runtime.run(card, mount())
    const program = runtime.currentProgram(id)
    expect(program?.source).toBe(card.script)
    expect(program?.source).toBe(store.getCard(id)?.script)
    expect(bytes(program?.source ?? '')).toEqual(bytes(card.script))
  })

  describe('properties', () => {
    it('commitScript then rerun keeps the stored and the running script === the committed one', () => {
      fc.assert(
        fc.property(arbProgram, fc.constantFrom('\n', '\r\n'), (program, newline) => {
          const s = print(program).replace(/\n/g, newline)
          const { store, runtime } = setup()
          const before = store.getCard('hello')
          if (before === undefined) throw new Error('no hello card')
          runtime.run(before, mount())
          const result = store.commitScript('hello', s, { kind: 'edited', at: NOW.toISOString() })
          expect(result.ok).toBe(true)
          if (!result.ok) return
          runtime.rerun(result.card)
          const stored = store.getCard('hello')?.script
          const running = runtime.currentProgram('hello')?.source
          expect(stored).toBe(s)
          expect(running).toBe(s)
          expect(bytes(stored ?? '')).toEqual(bytes(s))
          expect(bytes(running ?? '')).toEqual(bytes(s))
        }),
        { numRuns: 200 },
      )
    })
  })
})
