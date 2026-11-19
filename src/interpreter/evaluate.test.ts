import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbArithmeticExpression, arbStringValue } from '../parser/arbitraries'
import type { Expression } from '../parser'
import { parse } from '../parser'
import { evaluate, formatDate, formatTime, type EvalContext } from './evaluate'
import { FakeHost } from './fakeHost'
import { renderNumber } from './values'

const NOW = new Date(2026, 10, 1, 15, 4)

function context(overrides: Partial<EvalContext> = {}): EvalContext {
  const host = new FakeHost(
    [
      { kind: 'field', name: 'count', visible: true, text: '41' },
      { kind: 'field', name: 'name', visible: true, text: 'Ada' },
      { kind: 'button', name: 'Go', visible: true },
    ],
    NOW,
  )
  return { host, variables: new Map(), target: 'Go', ...overrides }
}

/** Parses an expression by wrapping it in a put statement. */
function expr(source: string): Expression {
  const result = parse(`on mouseUp\n  put ${source}\nend mouseUp\n`)
  if (!result.ok) throw new Error(result.error.message)
  const statement = result.program.handlers[0]?.body[0]
  if (statement?.kind !== 'put') throw new Error('expected put')
  return statement.value
}

function value(source: string, ctx: EvalContext = context()): string {
  const result = evaluate(expr(source), ctx)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function error(source: string, ctx: EvalContext = context()) {
  const result = evaluate(expr(source), ctx)
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`)
  return result.error
}

describe('evaluate', () => {
  it.each([
    ['42', '42'],
    ['007', '007'],
    ['"hi"', 'hi'],
    ['true', 'true'],
    ['false', 'false'],
    ['empty', ''],
    ['quote', '"'],
    ['return', '\n'],
    ['field "count"', '41'],
    ['field "COUNT"', '41'],
    ['button "go"', 'Go'],
    ['the target', 'Go'],
    ['the date', '11/1/26'],
    ['the time', '3:04 PM'],
    ['1 + 2', '3'],
    ['10 / 4', '2.5'],
    ['-7 div 2', '-3'],
    ['-7 mod 2', '-1'],
    ['field "count" + 1', '42'],
    ['"a" & "b"', 'ab'],
    ['"a" && "b"', 'a b'],
    ['"Hello, " & field "name" & "!"', 'Hello, Ada!'],
    ['1 = 1.0', 'true'],
    ['"abc" = "ABC"', 'true'],
    ['"abc" is "abd"', 'false'],
    ['"abc" is not "abd"', 'true'],
    ['1 <> 2', 'true'],
    ['2 < 10', 'true'],
    ['"2" < "10"', 'true'],
    ['"b" < "a"', 'false'],
    ['"B" > "a"', 'true'],
    ['3 >= 3', 'true'],
    ['3 <= 2', 'false'],
    ['true and false', 'false'],
    ['true or false', 'true'],
    ['TRUE and True', 'true'],
    ['not true', 'false'],
    ['not not true', 'true'],
    ['-(1 + 2)', '-3'],
    ['-0', '0'],
    ['- -5', '5'],
    ['field "name" is empty', 'false'],
    ['"" is empty', 'true'],
  ])('%s = %j', (source, expected) => {
    expect(value(source)).toBe(expected)
  })

  it('yields the name of an unset variable as spelled at the reading site', () => {
    expect(value('Total')).toBe('Total')
    expect(value('total', context({ variables: new Map([['total', '5']]) }))).toBe('5')
    expect(value('TOTAL', context({ variables: new Map([['total', '5']]) }))).toBe('5')
  })

  it('reads the target from the context', () => {
    expect(value('the target', context({ target: '' }))).toBe('')
  })

  it.each([
    ['field "missing"', 'field "missing" does not exist', 1, 7],
    ['button "missing"', 'button "missing" does not exist', 1, 7],
    ['"abc" + 1', 'expected a number, found "abc"', 1, 7],
    ['1 + "abc"', 'expected a number, found "abc"', 1, 7],
    ['1 / 0', 'division by zero', 1, 7],
    ['1 div 0', 'division by zero', 1, 7],
    ['1 mod 0', 'division by zero', 1, 7],
    ['"x" and true', 'expected true or false, found "x"', 1, 7],
    ['true or "x"', 'expected true or false, found "x"', 1, 7],
    ['not "x"', 'expected true or false, found "x"', 1, 7],
    ['-"x"', 'expected a number, found "x"', 1, 7],
    ['1 + (2 * "y")', 'expected a number, found "y"', 1, 12],
  ])('%s fails with %j', (source, message, _line, column) => {
    expect(error(source)).toEqual({ message, line: 2, column })
  })

  it('evaluates both operands of and/or before checking them', () => {
    const ctx = context()
    expect(error('field "missing" and "x"', ctx).message).toBe('field "missing" does not exist')
    expect(error('"x" and field "missing"', ctx).message).toBe('field "missing" does not exist')
  })

  it('rejects a value over 64 KiB from concatenation', () => {
    const big = 'a'.repeat(65_536)
    const ctx = context({ variables: new Map([['big', big]]) })
    expect(value('big & ""', ctx)).toHaveLength(65_536)
    expect(error('big & "x"', ctx).message).toBe('value too long')
    expect(error('big && ""', ctx).message).toBe('value too long')
  })

  it('renders a non-finite result as out of range', () => {
    const ctx = context({ variables: new Map([['huge', '9'.repeat(200)]]) })
    expect(error('huge * huge', ctx).message).toBe('number out of range')
  })
})

describe('formatDate and formatTime', () => {
  it.each([
    [new Date(2026, 10, 1, 0, 5), '11/1/26', '12:05 AM'],
    [new Date(2026, 0, 9, 12, 0), '1/9/26', '12:00 PM'],
    [new Date(2026, 11, 31, 23, 59), '12/31/26', '11:59 PM'],
    [new Date(2030, 4, 15, 1, 7), '5/15/30', '1:07 AM'],
    [new Date(2009, 2, 3, 13, 30), '3/3/09', '1:30 PM'],
  ])('%s', (date, expectedDate, expectedTime) => {
    expect(formatDate(date)).toBe(expectedDate)
    expect(formatTime(date)).toBe(expectedTime)
  })
})

describe('properties', () => {
  type Ref = { ok: true; value: number } | { ok: false }

  /** Reference evaluation with JS numbers; ok: false means a division by zero somewhere. */
  function reference(e: Expression): Ref {
    switch (e.kind) {
      case 'number':
        return { ok: true, value: Number(e.text) }
      case 'unary': {
        const inner = reference(e.operand)
        return inner.ok ? { ok: true, value: -inner.value } : inner
      }
      case 'binary': {
        const l = reference(e.left)
        const r = reference(e.right)
        if (!l.ok || !r.ok) return { ok: false }
        switch (e.operator) {
          case '+':
            return { ok: true, value: l.value + r.value }
          case '-':
            return { ok: true, value: l.value - r.value }
          case '*':
            return { ok: true, value: l.value * r.value }
          case 'div':
            return r.value === 0 ? { ok: false } : { ok: true, value: Math.trunc(l.value / r.value) }
          case 'mod':
            return r.value === 0 ? { ok: false } : { ok: true, value: l.value % r.value }
          default:
            throw new Error(`unexpected operator ${e.operator}`)
        }
      }
      default:
        throw new Error(`unexpected node ${e.kind}`)
    }
  }

  it('agrees with a JS reference evaluator on + - * div mod over integers', () => {
    fc.assert(
      fc.property(arbArithmeticExpression, (e) => {
        const expected = reference(e)
        fc.pre(expected.ok)
        const rendered = renderNumber(expected.value)
        if (!rendered.ok) throw new Error('reference out of range')
        expect(evaluate(e, context())).toEqual({ ok: true, value: rendered.value })
      }),
      { numRuns: 100 },
    )
  })

  it('a & b has length len(a) + len(b) and a && b equals a + " " + b', () => {
    fc.assert(
      fc.property(arbStringValue, arbStringValue, (a, b) => {
        const ctx = context({ variables: new Map([['a', a], ['b', b]]) })
        expect(value('a & b', ctx)).toHaveLength(a.length + b.length)
        expect(value('a && b', ctx)).toBe(`${a} ${b}`)
      }),
      { numRuns: 100 },
    )
  })
})
