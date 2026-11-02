// Expression parser for docs/grammar.md §4, by precedence climbing over the
// levels in the grammar (lowest first): or, and, not, comparison, concat,
// additive, term, unary minus, primary. All binary operators are
// left-associative; a comparison takes at most one operator (`a = b = c` is a
// parse error, write `(a = b) = c`). After `is`, a following `not` always
// belongs to the operator (`a is not b`).
import type { BinaryOperator, BuiltinName, ConstantName, Expression, ObjectRef } from './ast'
import type { Token } from './lexer'
import type { Cursor } from './tokens'

const CONSTANTS: ReadonlySet<string> = new Set<ConstantName>(['true', 'false', 'empty', 'quote', 'return'])
const BUILTINS: ReadonlySet<string> = new Set<BuiltinName>(['date', 'time', 'target'])

export function parseExpression(cursor: Cursor): Expression {
  return parseOr(cursor)
}

/** `field "x"` or `button "x"`; the cursor must be on `field` or `button`. */
export function parseObjectRef(cursor: Cursor): ObjectRef {
  const token = cursor.peek()
  if (!cursor.isKeyword('field') && !cursor.isKeyword('button')) cursor.expected('"field" or "button"')
  cursor.next()
  const name = cursor.peek()
  if (name.kind !== 'string') cursor.expected('a string')
  cursor.next()
  return {
    kind: 'objectRef',
    objectKind: token.text.toLowerCase() === 'field' ? 'field' : 'button',
    name: name.text.slice(1, -1),
    line: token.line,
    column: token.column,
  }
}

function binary(operator: BinaryOperator, left: Expression, right: Expression): Expression {
  return { kind: 'binary', operator, left, right, line: left.line, column: left.column }
}

/** The binary operator a token stands for at a given level, or undefined. */
function keywordOperator(cursor: Cursor, token: Token, words: readonly BinaryOperator[]): BinaryOperator | undefined {
  if (token.kind !== 'keyword') return undefined
  const word = token.text.toLowerCase()
  return words.find((w) => w === word && cursor.isKeyword(word, token))
}

function symbolOperator(token: Token, symbols: readonly BinaryOperator[]): BinaryOperator | undefined {
  if (token.kind !== 'operator') return undefined
  return symbols.find((s) => s === token.text)
}

function parseOr(cursor: Cursor): Expression {
  let left = parseAnd(cursor)
  while (keywordOperator(cursor, cursor.peek(), ['or']) !== undefined) {
    cursor.next()
    left = binary('or', left, parseAnd(cursor))
  }
  return left
}

function parseAnd(cursor: Cursor): Expression {
  let left = parseNot(cursor)
  while (keywordOperator(cursor, cursor.peek(), ['and']) !== undefined) {
    cursor.next()
    left = binary('and', left, parseNot(cursor))
  }
  return left
}

function parseNot(cursor: Cursor): Expression {
  const token = cursor.peek()
  if (cursor.isKeyword('not')) {
    cursor.next()
    const operand = parseNot(cursor)
    return { kind: 'unary', operator: 'not', operand, line: token.line, column: token.column }
  }
  return parseComparison(cursor)
}

const COMPARISON_SYMBOLS: readonly BinaryOperator[] = ['=', '<>', '<', '>', '<=', '>=']

function parseComparison(cursor: Cursor): Expression {
  const left = parseConcat(cursor)
  const token = cursor.peek()
  const symbol = symbolOperator(token, COMPARISON_SYMBOLS)
  if (symbol !== undefined) {
    cursor.next()
    return binary(symbol, left, parseConcat(cursor))
  }
  if (cursor.isKeyword('is')) {
    cursor.next()
    let operator: BinaryOperator = 'is'
    if (cursor.isKeyword('not')) {
      cursor.next()
      operator = 'is not'
    }
    return binary(operator, left, parseConcat(cursor))
  }
  return left
}

function parseConcat(cursor: Cursor): Expression {
  let left = parseAdditive(cursor)
  for (;;) {
    const operator = symbolOperator(cursor.peek(), ['&&', '&'])
    if (operator === undefined) return left
    cursor.next()
    left = binary(operator, left, parseAdditive(cursor))
  }
}

function parseAdditive(cursor: Cursor): Expression {
  let left = parseTerm(cursor)
  for (;;) {
    const operator = symbolOperator(cursor.peek(), ['+', '-'])
    if (operator === undefined) return left
    cursor.next()
    left = binary(operator, left, parseTerm(cursor))
  }
}

function parseTerm(cursor: Cursor): Expression {
  let left = parseUnary(cursor)
  for (;;) {
    const token = cursor.peek()
    const operator = symbolOperator(token, ['*', '/']) ?? keywordOperator(cursor, token, ['div', 'mod'])
    if (operator === undefined) return left
    cursor.next()
    left = binary(operator, left, parseUnary(cursor))
  }
}

function parseUnary(cursor: Cursor): Expression {
  const token = cursor.peek()
  if (cursor.isOperator('-')) {
    cursor.next()
    const operand = parseUnary(cursor)
    return { kind: 'unary', operator: '-', operand, line: token.line, column: token.column }
  }
  return parsePrimary(cursor)
}

function parsePrimary(cursor: Cursor): Expression {
  const token = cursor.peek()
  const position = { line: token.line, column: token.column }
  switch (token.kind) {
    case 'number':
      cursor.next()
      return { kind: 'number', text: token.text, ...position }
    case 'string':
      cursor.next()
      return { kind: 'string', value: token.text.slice(1, -1), ...position }
    case 'keyword': {
      const word = token.text.toLowerCase()
      if (CONSTANTS.has(word)) {
        cursor.next()
        return { kind: 'constant', name: word as ConstantName, ...position }
      }
      if (word === 'field' || word === 'button') return parseObjectRef(cursor)
      if (word === 'the') {
        cursor.next()
        const name = cursor.peek()
        const builtin = name.text.toLowerCase()
        if (name.kind !== 'identifier' || !BUILTINS.has(builtin)) cursor.expected('"date", "time" or "target"')
        cursor.next()
        return { kind: 'builtin', name: builtin as BuiltinName, ...position }
      }
      return cursor.expected('an expression')
    }
    case 'identifier':
      if (cursor.isReserved()) cursor.expected('an expression')
      cursor.next()
      return { kind: 'variable', name: token.text, ...position }
    case 'operator':
      if (token.text === '(') {
        cursor.next()
        const inner = parseExpression(cursor)
        cursor.expectOperator(')')
        return inner
      }
      return cursor.expected('an expression')
    default:
      return cursor.expected('an expression')
  }
}
