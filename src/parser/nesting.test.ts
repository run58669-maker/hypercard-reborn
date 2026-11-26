import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { withoutPositions } from './arbitraries'
import type { DeepScript } from './deepScripts'
import { CHAIN_OPERATORS, chain, deepScripts, elseIfs, ifs, minuses, mix, nots, parentheses, repeats } from './deepScripts'
import type { ParseError } from './errors'
import { MAX_NESTING, parse } from './index'
import { print } from './printer'

// Task 18.1, requirement 7.4: more than 64 levels is the parse error
// `expression too long or nested too deeply (limit 64)` (reworded in task 18.2)
// at the token that would open level 65, and parse never throws. The run and object-check halves of requirement 7.5 are in
// src/interpreter/nesting.test.ts and src/compile/nesting.test.ts.

const MESSAGE = 'expression too long or nested too deeply (limit 64)'

function outcome(source: string): ReturnType<typeof parse> | string {
  try {
    return parse(source)
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
}

/** The whole error for a script whose level 65 is opened by `script.opener(65)`. */
function tooDeep(script: DeepScript): ParseError {
  const { line, column } = script.opener(MAX_NESTING + 1)
  return { line, column, message: MESSAGE, near: script.source.split('\n')[line - 1] ?? '' }
}

function rows(scripts: readonly DeepScript[]): Array<[string, DeepScript]> {
  return scripts.map((script) => [script.label, script])
}

const AT_LIMIT = deepScripts(64)

describe('nesting limit', () => {
  it('is 64 and exported from the module index', () => {
    expect(MAX_NESTING).toBe(64)
  })

  it.each(rows(deepScripts(65)))('rejects %s at the token that opens level 65', (_label, script) => {
    expect(outcome(script.source)).toEqual({ ok: false, error: tooDeep(script) })
  })

  it('puts the error for 65 parentheses on the 65th "("', () => {
    const result = parse(parentheses(65).source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect([result.error.line, result.error.column]).toEqual([2, 6 + 65])
  })

  const huge: DeepScript[] = [
    parentheses(1000),
    parentheses(20000),
    nots(20000),
    minuses(20000),
    ...CHAIN_OPERATORS.map(([operator, operand]) => chain(operator, operand, 20000)),
    ifs(3000),
    elseIfs(3000),
    repeats(3000),
  ]
  it.each(rows(huge))('rejects %s, far over the limit, with the same error at the token that opens level 65', (_label, script) => {
    expect(outcome(script.source)).toEqual({ ok: false, error: tooDeep(script) })
  })

  it.each(rows(AT_LIMIT))('parses %s, which reaches exactly 64 levels', (_label, script) => {
    const result = outcome(script.source)
    expect(typeof result === 'object' && result.ok).toBe(true)
  })

  // Task 19.3: what print returns is checked, not only that it returns.
  it.each(rows(AT_LIMIT))('prints %s as text that parses back to the same tree and prints the same again', (_label, script) => {
    const result = parse(script.source)
    if (!result.ok) throw new Error(result.error.message)
    const printed = print(result.program)
    const again = parse(printed)
    if (!again.ok) throw new Error(`the printed text does not parse: ${again.error.message}`)
    expect(withoutPositions(again.program)).toEqual(withoutPositions(result.program))
    expect(print(again.program)).toBe(printed)
  })

  it('counts 30 parentheses inside 20 "+" inside 15 if as 65 levels', () => {
    const script = mix(65)
    expect(script.source).toContain(`put ${'('.repeat(30)}1${')'.repeat(30)}${' + 1'.repeat(20)} into x`)
    expect(parse(script.source)).toEqual({ ok: false, error: { ...tooDeep(script), column: 2 * 30 + 7 + 4 * 19 } })
  })
})

describe('what a chain operator pays', () => {
  const put = (expression: string): string => `on mouseUp\n  put ${expression} into x\nend mouseUp\n`

  it('parses 64 parenthesised operands in a row', () => {
    expect(parse(put(Array.from({ length: 64 }, () => '(x)').join(' + '))).ok).toBe(true)
  })

  it('counts the levels inside the leftmost operand: 63 "and" over (not x) is 65', () => {
    const source = Array.from({ length: 64 }, () => '(not x)').join(' and ')
    const result = parse(put(source))
    expect(result.ok ? null : result.error.column).toBe(7 + source.lastIndexOf('and'))
  })

  it('sits one level above a parenthesised chain on its left', () => {
    const inner = `1${' + 1'.repeat(62)}`
    expect(parse(put(`(${inner}) * 2`)).ok).toBe(true)
    const deeper = `(${inner} + 1) * 2`
    const result = parse(put(deeper))
    expect(result).toEqual({
      ok: false,
      error: { line: 2, column: 7 + deeper.indexOf('*'), message: MESSAGE, near: `  put ${deeper} into x` },
    })
  })

  const operators: Array<[string, string]> = [...CHAIN_OPERATORS.map(([operator, operand]): [string, string] => [operator, operand]), ['=', '1'], ['is not', '1']]

  it.each(operators)('puts the right operand of "%s" one level in', (operator, operand) => {
    const right = (open: number): string => `${operand} ${operator} ${'('.repeat(open)}${operand}${')'.repeat(open)}`
    expect(parse(put(right(63))).ok).toBe(true)
    const source = right(64)
    const result = parse(put(source))
    expect(result.ok ? null : result.error.column).toBe(7 + source.lastIndexOf('('))
  })

  it.each(operators)('puts "%s" one level above a parenthesised left operand', (operator, operand) => {
    const left = (open: number): string => `${'('.repeat(open)}${operand}${')'.repeat(open)} ${operator} ${operand}`
    expect(parse(put(left(63))).ok).toBe(true)
    const source = left(64)
    const result = parse(put(source))
    expect(result.ok ? null : result.error.column).toBe(7 + source.lastIndexOf(operator === 'is not' ? 'is' : operator))
  })

  it('sits one level above a chain of a tighter level on its left', () => {
    const terms = `1${' * 1'.repeat(40)}`
    expect(parse(put(`${terms}${' + 1'.repeat(24)}`)).ok).toBe(true)
    const source = `${terms}${' + 1'.repeat(25)}`
    const result = parse(put(source))
    expect(result.ok ? null : result.error.column).toBe(7 + source.lastIndexOf('+'))
  })

  it('sits one level above a deep right operand earlier in the chain', () => {
    const right = `${'('.repeat(62)}1${')'.repeat(62)}`
    expect(parse(put(`1 + ${right} + 1`)).ok).toBe(true)
    const source = `1 + ${right} + 1 + 1`
    const result = parse(put(source))
    expect(result.ok ? null : result.error.column).toBe(7 + source.lastIndexOf('+'))
  })

  it('rejects the left-deep tree that overflowed print and run when operators paid only above the chain start', () => {
    // Each wrap: a parenthesised left operand, then 32 operators on each of
    // five precedence levels. Paying one level per operator above the chain's
    // start let this parse into a tree 5121 nodes deep (2026-11-26).
    let expression = '1'
    for (let i = 0; i < 32; i += 1) {
      expression = `(${expression})${[' * 1', ' + 1', ' & 1', ' and true', ' or true'].map((s) => s.repeat(32)).join('')}`
    }
    const result = outcome(put(expression))
    expect(typeof result === 'object' && !result.ok && result.error.message).toBe(MESSAGE)
  })
})

describe('loops that do not deepen the tree pay nothing', () => {
  it('parses 5000 statements in one handler', () => {
    const body = '  put (x + 1) * -y & "a" into x\n'.repeat(5000)
    const result = parse(`on mouseUp\n${body}end mouseUp\n`)
    expect(result.ok && result.program.handlers[0]?.body.length).toBe(5000)
  })

  it('parses 5000 blank and comment lines around the handlers', () => {
    const filler = '\n-- a comment\n'.repeat(2500)
    const result = parse(`${filler}on mouseUp\n  put 1\nend mouseUp\n${filler}on openCard\n  put 2\nend openCard\n${filler}`)
    expect(result.ok && result.program.handlers.length).toBe(2)
  })

  it('gives every level back: 100 statements that each use every construct', () => {
    const block = [
      'if (not - 1 = 1) or true and "a" & "b" && 1 + 2 * 3 div 4 mod 5 - 6 / 7 is not 8 then',
      '  repeat 1 times',
      '    put (1) into x',
      '  end repeat',
      'else',
      '  put 2 into x',
      'end if',
      '',
    ].join('\n')
    expect(parse(`on mouseUp\n${block.repeat(100)}end mouseUp\n`).ok).toBe(true)
  })
})

describe('bundled scripts', () => {
  it.each(EXAMPLES.map((example) => [example.id, example.script]))('%s still parses', (_id, script) => {
    expect(parse(script).ok).toBe(true)
  })
})
