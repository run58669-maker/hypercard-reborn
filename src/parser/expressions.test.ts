import { describe, expect, it } from 'vitest'
import type { Expression } from './ast'
import { parse } from './parser'

/** Parses `expr` inside a `put` statement and returns the value without positions. */
function expression(source: string): unknown {
  const result = parse(`on mouseUp\n  put ${source}\nend mouseUp\n`)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${result.error.line}, column ${result.error.column})`)
  const statement = result.program.handlers[0]?.body[0]
  if (statement?.kind !== 'put') throw new Error('expected a put statement')
  return strip(statement.value)
}

function strip(node: Expression): unknown {
  switch (node.kind) {
    case 'binary':
      return { kind: 'binary', operator: node.operator, left: strip(node.left), right: strip(node.right) }
    case 'unary':
      return { kind: 'unary', operator: node.operator, operand: strip(node.operand) }
    case 'number':
      return { kind: 'number', text: node.text }
    case 'string':
      return { kind: 'string', value: node.value }
    case 'constant':
      return { kind: 'constant', name: node.name }
    case 'variable':
      return { kind: 'variable', name: node.name }
    case 'objectRef':
      return { kind: 'objectRef', objectKind: node.objectKind, name: node.name }
    case 'builtin':
      return { kind: 'builtin', name: node.name }
  }
}

const n = (text: string) => ({ kind: 'number', text })
const v = (name: string) => ({ kind: 'variable', name })
const s = (value: string) => ({ kind: 'string', value })
const bin = (operator: string, left: unknown, right: unknown) => ({ kind: 'binary', operator, left, right })
const un = (operator: string, operand: unknown) => ({ kind: 'unary', operator, operand })

describe('parseExpression', () => {
  it.each([
    // primaries
    ['42', n('42')],
    ['3.5', n('3.5')],
    ['"hi"', s('hi')],
    ['""', s('')],
    ['true', { kind: 'constant', name: 'true' }],
    ['FALSE', { kind: 'constant', name: 'false' }],
    ['empty', { kind: 'constant', name: 'empty' }],
    ['quote', { kind: 'constant', name: 'quote' }],
    ['return', { kind: 'constant', name: 'return' }],
    ['Total', v('Total')],
    ['field "x"', { kind: 'objectRef', objectKind: 'field', name: 'x' }],
    ['button "Go"', { kind: 'objectRef', objectKind: 'button', name: 'Go' }],
    ['the date', { kind: 'builtin', name: 'date' }],
    ['the time', { kind: 'builtin', name: 'time' }],
    ['The Target', { kind: 'builtin', name: 'target' }],
    ['(1)', n('1')],
    ['((x))', v('x')],
    // or < and
    ['a or b and c', bin('or', v('a'), bin('and', v('b'), v('c')))],
    ['a and b or c', bin('or', bin('and', v('a'), v('b')), v('c'))],
    ['a or b or c', bin('or', bin('or', v('a'), v('b')), v('c'))],
    // and < not
    ['not a and b', bin('and', un('not', v('a')), v('b'))],
    ['not not a', un('not', un('not', v('a')))],
    // not < comparison
    ['not a = b', un('not', bin('=', v('a'), v('b')))],
    // comparison < concat
    ['a & b = c & d', bin('=', bin('&', v('a'), v('b')), bin('&', v('c'), v('d')))],
    ['a <> b', bin('<>', v('a'), v('b'))],
    ['a < b', bin('<', v('a'), v('b'))],
    ['a > b', bin('>', v('a'), v('b'))],
    ['a <= b', bin('<=', v('a'), v('b'))],
    ['a >= b', bin('>=', v('a'), v('b'))],
    ['a is b', bin('is', v('a'), v('b'))],
    // `is not` always belongs to the operator
    ['a is not b', bin('is not', v('a'), v('b'))],
    ['a is (not b)', bin('is', v('a'), un('not', v('b')))],
    ['the target is "Increment"', bin('is', { kind: 'builtin', name: 'target' }, s('Increment'))],
    // concat < additive
    ['a & b + c', bin('&', v('a'), bin('+', v('b'), v('c')))],
    ['a && b & c', bin('&', bin('&&', v('a'), v('b')), v('c'))],
    ['field "list" & i & return', bin('&', bin('&', { kind: 'objectRef', objectKind: 'field', name: 'list' }, v('i')), { kind: 'constant', name: 'return' })],
    // additive < term
    ['a + b * c', bin('+', v('a'), bin('*', v('b'), v('c')))],
    ['a - b - c', bin('-', bin('-', v('a'), v('b')), v('c'))],
    ['a * b / c', bin('/', bin('*', v('a'), v('b')), v('c'))],
    ['a div b mod c', bin('mod', bin('div', v('a'), v('b')), v('c'))],
    ['field "count" + 1', bin('+', { kind: 'objectRef', objectKind: 'field', name: 'count' }, n('1'))],
    // term < unary minus
    ['-a * b', bin('*', un('-', v('a')), v('b'))],
    ['a * -b', bin('*', v('a'), un('-', v('b')))],
    ['- -a', un('-', un('-', v('a')))],
    ['-7 div 2', bin('div', un('-', n('7')), n('2'))],
    // parentheses override precedence
    ['(a + b) * c', bin('*', bin('+', v('a'), v('b')), v('c'))],
    ['(a or b) and c', bin('and', bin('or', v('a'), v('b')), v('c'))],
    ['-(a + b)', un('-', bin('+', v('a'), v('b')))],
  ])('parses %j', (source, expected) => {
    expect(expression(source)).toEqual(expected)
  })

  it.each([
    ['a = b = c', 'expected newline, found "="'],
    ['end', 'expected an expression, found "end"'],
    ['x + end', 'expected an expression, found "end"'],
    ['down', 'expected an expression, found "down"'],
    ['the', 'expected "date", "time" or "target", found newline'],
    ['field x', 'expected a string, found "x"'],
    ['(1', 'expected ")", found newline'],
    ['1 +', 'expected an expression, found newline'],
    ['a is', 'expected an expression, found newline'],
  ])('rejects %j', (source, message) => {
    const result = parse(`on mouseUp\n  put ${source}\nend mouseUp\n`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(message)
  })
})
