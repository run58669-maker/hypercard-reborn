// Expression parser for docs/grammar.md §4. Task 3.1 ships primaries only;
// task 3.3 adds the operator precedence levels.
import type { BuiltinName, ConstantName, Expression, ObjectRef } from './ast'
import type { Cursor } from './tokens'

const CONSTANTS: ReadonlySet<string> = new Set<ConstantName>(['true', 'false', 'empty', 'quote', 'return'])
const BUILTINS: ReadonlySet<string> = new Set<BuiltinName>(['date', 'time', 'target'])

export function parseExpression(cursor: Cursor): Expression {
  return parsePrimary(cursor)
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
