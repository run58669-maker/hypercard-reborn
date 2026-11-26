// Expression parser for docs/grammar.md §4 (task 3.3), by precedence climbing over the
// levels in the grammar (lowest first): or, and, not, comparison, concat,
// additive, term, unary minus, primary. All binary operators are
// left-associative; a comparison takes at most one operator (`a = b = c` is a
// parse error, write `(a = b) = c`). After `is`, a following `not` always
// belongs to the operator (`a is not b`).
//
// Nesting limit (design.md §4.4): `(`, `not` and unary `-` each open one level
// around what they enclose. Each binary operator's node sits one level above
// the deepest level its left operand reached (`chainOperator`), and its right
// operand is parsed one level in, so a parse that succeeds never builds a tree
// deeper than MAX_NESTING levels, however the levels are spent.
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
  const outer = cursor.startChain()
  let left = parseAnd(cursor)
  while (keywordOperator(cursor, cursor.peek(), ['or']) !== undefined) {
    const token = cursor.next()
    cursor.chainOperator(token)
    cursor.enter(token)
    left = binary('or', left, parseAnd(cursor))
    cursor.leave()
  }
  cursor.endChain(outer)
  return left
}

function parseAnd(cursor: Cursor): Expression {
  const outer = cursor.startChain()
  let left = parseNot(cursor)
  while (keywordOperator(cursor, cursor.peek(), ['and']) !== undefined) {
    const token = cursor.next()
    cursor.chainOperator(token)
    cursor.enter(token)
    left = binary('and', left, parseNot(cursor))
    cursor.leave()
  }
  cursor.endChain(outer)
  return left
}

function parseNot(cursor: Cursor): Expression {
  const token = cursor.peek()
  if (cursor.isKeyword('not')) {
    cursor.enter(cursor.next())
    const operand = parseNot(cursor)
    cursor.leave()
    return { kind: 'unary', operator: 'not', operand, line: token.line, column: token.column }
  }
  return parseComparison(cursor)
}

const COMPARISON_SYMBOLS: readonly BinaryOperator[] = ['=', '<>', '<', '>', '<=', '>=']

function parseComparison(cursor: Cursor): Expression {
  const outer = cursor.startChain()
  const left = parseConcat(cursor)
  const token = cursor.peek()
  let operator = symbolOperator(token, COMPARISON_SYMBOLS)
  if (operator !== undefined) {
    cursor.next()
  } else if (cursor.isKeyword('is')) {
    cursor.next()
    operator = 'is'
    if (cursor.isKeyword('not')) {
      cursor.next()
      operator = 'is not'
    }
  }
  if (operator !== undefined) {
    cursor.chainOperator(token)
    cursor.enter(token)
    const right = parseConcat(cursor)
    cursor.leave()
    cursor.endChain(outer)
    return binary(operator, left, right)
  }
  cursor.endChain(outer)
  return left
}

function parseConcat(cursor: Cursor): Expression {
  const outer = cursor.startChain()
  let left = parseAdditive(cursor)
  for (;;) {
    const operator = symbolOperator(cursor.peek(), ['&&', '&'])
    if (operator === undefined) break
    const token = cursor.next()
    cursor.chainOperator(token)
    cursor.enter(token)
    left = binary(operator, left, parseAdditive(cursor))
    cursor.leave()
  }
  cursor.endChain(outer)
  return left
}

function parseAdditive(cursor: Cursor): Expression {
  const outer = cursor.startChain()
  let left = parseTerm(cursor)
  for (;;) {
    const operator = symbolOperator(cursor.peek(), ['+', '-'])
    if (operator === undefined) break
    const token = cursor.next()
    cursor.chainOperator(token)
    cursor.enter(token)
    left = binary(operator, left, parseTerm(cursor))
    cursor.leave()
  }
  cursor.endChain(outer)
  return left
}

function parseTerm(cursor: Cursor): Expression {
  const outer = cursor.startChain()
  let left = parseUnary(cursor)
  for (;;) {
    const token = cursor.peek()
    const operator = symbolOperator(token, ['*', '/']) ?? keywordOperator(cursor, token, ['div', 'mod'])
    if (operator === undefined) break
    cursor.next()
    cursor.chainOperator(token)
    cursor.enter(token)
    left = binary(operator, left, parseUnary(cursor))
    cursor.leave()
  }
  cursor.endChain(outer)
  return left
}

function parseUnary(cursor: Cursor): Expression {
  const token = cursor.peek()
  if (cursor.isOperator('-')) {
    cursor.enter(cursor.next())
    const operand = parseUnary(cursor)
    cursor.leave()
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
        cursor.enter(cursor.next())
        const inner = parseExpression(cursor)
        cursor.expectOperator(')')
        cursor.leave()
        return inner
      }
      return cursor.expected('an expression')
    default:
      return cursor.expected('an expression')
  }
}
