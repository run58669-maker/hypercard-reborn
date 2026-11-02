// Recursive-descent parser for docs/grammar.md §2-§3. `parse()` is total: it
// returns a ParseResult and never throws (design.md §4.1). `program.source`
// is the input string by reference; nothing here trims or normalises it.
import type {
  Container,
  Handler,
  HandlerName,
  ObjectRef,
  Property,
  Statement,
} from './ast'
import type { ParseResult } from './errors'
import { parseExpression, parseObjectRef } from './expressions'
import { lex } from './lexer'
import { Cursor, Failure } from './tokens'

export function parse(source: string): ParseResult {
  const lexed = lex(source)
  if (!lexed.ok) return lexed
  const cursor = new Cursor(source, lexed.tokens)
  try {
    const handlers = parseScript(cursor)
    return { ok: true, program: { source, handlers } }
  } catch (error) {
    if (error instanceof Failure) return { ok: false, error: error.error }
    throw error
  }
}

const HANDLER_NAMES: Readonly<Record<string, HandlerName>> = { mouseup: 'mouseUp', opencard: 'openCard' }
const PROPERTIES: ReadonlySet<string> = new Set<Property>(['visible', 'enabled', 'name'])

function parseScript(cursor: Cursor): Handler[] {
  const handlers: Handler[] = []
  for (;;) {
    cursor.skipNewlines()
    if (cursor.peek().kind === 'eof') return handlers
    if (!cursor.isKeyword('on')) cursor.expected('"on"')
    const handler = parseHandler(cursor, handlers)
    handlers.push(handler)
  }
}

function parseHandler(cursor: Cursor, previous: readonly Handler[]): Handler {
  const on = cursor.next()
  const nameToken = cursor.peek()
  const name = nameToken.kind === 'identifier' ? HANDLER_NAMES[nameToken.text.toLowerCase()] : undefined
  if (name === undefined) cursor.expected('"mouseUp" or "openCard"')
  if (previous.some((h) => h.name === name)) cursor.fail(`duplicate handler "${name}"`, on)
  cursor.next()
  cursor.expectNewline()
  const body = parseStatements(cursor, `end ${name}`, false)
  cursor.next() // `end`
  const closer = cursor.peek()
  if (!(closer.kind === 'identifier' && HANDLER_NAMES[closer.text.toLowerCase()] === name)) {
    const foundText = closer.kind === 'identifier' ? `"end ${closer.text}"` : undefined
    if (foundText !== undefined) cursor.fail(`expected "end ${name}", found ${foundText}`, closer)
    cursor.expected(`"end ${name}"`)
  }
  cursor.next()
  cursor.expectNewline()
  return { kind: 'handler', name, body, line: on.line, column: on.column }
}

/**
 * Statements up to (not including) the `end` keyword that closes `closer`,
 * or an `else` keyword when `allowElse` is set. Blank and comment lines are
 * skipped (comments are lexer trivia, so they are just newlines here).
 */
function parseStatements(cursor: Cursor, closer: string, allowElse: boolean): Statement[] {
  const statements: Statement[] = []
  for (;;) {
    cursor.skipNewlines()
    const token = cursor.peek()
    if (token.kind === 'eof') cursor.expected(`"${closer}"`)
    if (cursor.isKeyword('end')) return statements
    if (allowElse && cursor.isKeyword('else')) return statements
    statements.push(parseStatement(cursor))
    cursor.expectNewline()
  }
}

function parseStatement(cursor: Cursor): Statement {
  const token = cursor.peek()
  const position = { line: token.line, column: token.column }
  if (token.kind !== 'keyword') cursor.expected('a statement')
  switch (token.text.toLowerCase()) {
    case 'put': {
      cursor.next()
      const value = parseExpression(cursor)
      let into: Container | null = null
      if (cursor.isKeyword('into')) {
        cursor.next()
        into = parseContainer(cursor)
      }
      return { kind: 'put', value, into, ...position }
    }
    case 'set': {
      cursor.next()
      const propertyToken = cursor.peek()
      const property = propertyToken.text.toLowerCase()
      if (propertyToken.kind !== 'identifier' || !PROPERTIES.has(property)) {
        cursor.expected('"visible", "enabled" or "name"')
      }
      cursor.next()
      if (!cursor.isIdentifier('of')) cursor.expected('"of"')
      cursor.next()
      const object = parseObjectRef(cursor)
      cursor.expectKeyword('to')
      const value = parseExpression(cursor)
      return { kind: 'set', property: property as Property, object, value, ...position }
    }
    case 'get': {
      cursor.next()
      return { kind: 'get', value: parseExpression(cursor), ...position }
    }
    case 'answer': {
      cursor.next()
      return { kind: 'answer', value: parseExpression(cursor), ...position }
    }
    case 'go': {
      cursor.next()
      if (cursor.isKeyword('to')) cursor.next()
      cursor.expectKeyword('card')
      return { kind: 'go', card: parseExpression(cursor), ...position }
    }
    case 'show': {
      cursor.next()
      return { kind: 'show', object: parseObjectRef(cursor), ...position }
    }
    case 'hide': {
      cursor.next()
      return { kind: 'hide', object: parseObjectRef(cursor), ...position }
    }
    default:
      return cursor.expected('a statement')
  }
}

function parseContainer(cursor: Cursor): Container {
  const token = cursor.peek()
  if (cursor.isKeyword('button')) cursor.fail('cannot put into a button; use set name of button')
  if (cursor.isKeyword('field')) {
    const ref: ObjectRef = parseObjectRef(cursor)
    return ref
  }
  if (token.kind !== 'identifier' || cursor.isReserved()) cursor.expected('a variable name')
  cursor.next()
  return { kind: 'variable', name: token.text, line: token.line, column: token.column }
}
