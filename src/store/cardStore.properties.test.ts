import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbProgram } from '../parser/arbitraries'
import { print } from '../parser/printer'
import { createCardStore } from './cardStore'
import { seedCards } from './seed'
import type { Card } from './types'

const NOW = new Date('2026-11-01T15:04:00.000Z')
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

function freshStore() {
  return createCardStore({ initial: seedCards(NOW), now: () => NOW })
}

// Arbitrary strings including lone surrogates and every kind of line ending,
// plus printed generated programs so the "parses" branch is exercised often.
const arbScriptCandidate = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string(),
  arbProgram.map(print),
  arbProgram.map((p) => print(p).replace(/\n/g, '\r\n')),
)

describe('properties', () => {
  it('(a) after commitScript the stored script is either unchanged or === the input', () => {
    fc.assert(
      fc.property(arbScriptCandidate, (s) => {
        const store = freshStore()
        const before = store.getCard('hello') as Card
        const result = store.commitScript('hello', s, { kind: 'edited', at: NOW.toISOString() })
        const after = store.getCard('hello') as Card
        if (result.ok) {
          expect(after.script).toBe(s)
          expect(bytes(after.script)).toEqual(bytes(s))
        } else {
          expect(after).toEqual(before)
          expect(after.script).toBe(before.script)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('(b) JSON round-trips the script byte for byte, lone surrogates included', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (script) => {
        const card: Card = { ...(seedCards(NOW)[0] as Card), script }
        const again = JSON.parse(JSON.stringify(card)) as Card
        expect(bytes(again.script)).toEqual(bytes(card.script))
        expect(again.script).toBe(script)
      }),
      { numRuns: 200 },
    )
  })

  it('(c) saveDescription leaves the script unchanged for arbitrary inputs', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), arbScriptCandidate, (description, script) => {
        const store = freshStore()
        store.commitScript('counter', script, { kind: 'edited', at: NOW.toISOString() })
        const before = store.getCard('counter')?.script as string
        store.saveDescription('counter', description)
        const card = store.getCard('counter') as Card
        expect(card.description).toBe(description)
        expect(card.script).toBe(before)
      }),
      { numRuns: 200 },
    )
  })
})
