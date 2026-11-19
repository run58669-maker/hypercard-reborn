import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import countdownScript from '../../.kiro/specs/flip-card/examples/countdown.hc/script.hc?raw'
import counterScript from '../../.kiro/specs/flip-card/examples/counter.hc/script.hc?raw'
import dateStampScript from '../../.kiro/specs/flip-card/examples/date-stamp.hc/script.hc?raw'
import greeterScript from '../../.kiro/specs/flip-card/examples/greeter.hc/script.hc?raw'
import helloScript from '../../.kiro/specs/flip-card/examples/hello.hc/script.hc?raw'
import quizScript from '../../.kiro/specs/flip-card/examples/quiz.hc/script.hc?raw'
import { arbProgram, withoutPositions } from './arbitraries'
import type { Program } from './ast'
import { parse } from './parser'
import { print } from './printer'

const EXAMPLES: ReadonlyArray<[id: string, script: string]> = [
  ['hello', helloScript],
  ['counter', counterScript],
  ['date-stamp', dateStampScript],
  ['greeter', greeterScript],
  ['countdown', countdownScript],
  ['quiz', quizScript],
]

function parsed(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${result.error.line}, column ${result.error.column})\n${source}`)
  return result.program
}

describe('print', () => {
  it.each(EXAMPLES)('reproduces the %s example, which is already canonical', (_id, script) => {
    expect(print(parsed(script))).toBe(script)
  })

  it('prints the empty program as the empty string', () => {
    expect(print(parsed(''))).toBe('')
  })

  it('adds parentheses only where precedence needs them', () => {
    const p = parsed('on mouseUp\n  put (a + b) * c & -(x) & (a is (not b))\n  put - -1\nend mouseUp\n')
    expect(print(p)).toBe('on mouseUp\n  put (a + b) * c & -x & (a is (not b))\n  put - -1\nend mouseUp\n')
  })

  it('lower-cases keywords and canonicalises handler names', () => {
    const p = parsed('ON OPENCARD\n  PUT 1 INTO Total\n  GO CARD 2\nEND opencard\n')
    expect(print(p)).toBe('on openCard\n  put 1 into Total\n  go to card 2\nend openCard\n')
  })
})

describe('properties', () => {
  it('round-trips generated programs through print and parse', () => {
    fc.assert(
      fc.property(arbProgram, (program) => {
        const printed = print(program)
        const again = parsed(printed)
        expect(withoutPositions(again)).toEqual(withoutPositions(program))
      }),
      { numRuns: 200 },
    )
  })

  it.each(EXAMPLES)('round-trips the %s example', (_id, script) => {
    const first = parsed(script)
    const again = parsed(print(first))
    expect(withoutPositions(again)).toEqual(withoutPositions(first))
  })
})
