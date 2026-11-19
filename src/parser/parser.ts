// Recursive-descent parser for docs/grammar.md §2-§3. `parse()` is total: it
// returns a ParseResult and never throws (design.md §4.1). `program.source`
// is the input string by reference; nothing here trims or normalises it.
import type {
  Container,
  Handler,
  HandlerName,
  IfStatement,
  ObjectRef,
  Property,
  RepeatHead,
  RepeatStatement,
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
    case 'if':
      return parseIf(cursor)
    case 'repeat':
      return parseRepeat(cursor)
    default:
      return cursor.expected('a statement')
  }
}

/**
 * Both `if` forms (grammar §3). A newline after `then` means the block form,
 * which ends with `end if`; anything else is the single-line form, whose
 * optional `else` must be on the very next line and belongs to this `if`.
 */
function parseIf(cursor: Cursor): IfStatement {
  const ifToken = cursor.next()
  const position = { line: ifToken.line, column: ifToken.column }
  const condition = parseExpression(cursor)
  cursor.expectKeyword('then')
  if (cursor.peek().kind === 'newline') {
    cursor.next()
    const thenBody = parseStatements(cursor, 'end if', true)
    let elseBody: Statement[] | null = null
    if (cursor.isKeyword('else')) {
      cursor.next()
      cursor.expectNewline()
      elseBody = parseStatements(cursor, 'end if', false)
    }
    expectEnd(cursor, 'if')
    return { kind: 'if', form: 'block', condition, then: thenBody, else: elseBody, ...position }
  }
  const thenStatement = parseSingleLineBranch(cursor)
  let elseBody: Statement[] | null = null
  if (cursor.peek().kind === 'newline' && cursor.isKeyword('else', cursor.peek(1))) {
    cursor.next()
    cursor.next()
    elseBody = [parseSingleLineBranch(cursor)]
  }
  return { kind: 'if', form: 'single', condition, then: [thenStatement], else: elseBody, ...position }
}

/** The one statement after `then` or `else` in the single-line form. */
function parseSingleLineBranch(cursor: Cursor): Statement {
  if (cursor.isKeyword('if') || cursor.isKeyword('repeat')) {
    cursor.fail('a single-line if cannot contain "if" or "repeat"')
  }
  return parseStatement(cursor)
}

/** `end <word>` where the cursor is on `end`; the error names what was expected. */
function expectEnd(cursor: Cursor, word: 'if' | 'repeat'): void {
  cursor.next() // `end`, guaranteed by parseStatements
  const closer = cursor.peek()
  if (!cursor.isKeyword(word)) {
    if (closer.kind === 'identifier' || closer.kind === 'keyword') {
      cursor.fail(`expected "end ${word}", found "end ${closer.text}"`, closer)
    }
    cursor.expected(`"end ${word}"`)
  }
  cursor.next()
}

function parseRepeat(cursor: Cursor): RepeatStatement {
  const repeatToken = cursor.next()
  const head = parseRepeatHead(cursor)
  cursor.expectNewline()
  const body = parseStatements(cursor, 'end repeat', false)
  expectEnd(cursor, 'repeat')
  return { kind: 'repeat', head, body, line: repeatToken.line, column: repeatToken.column }
}

function parseRepeatHead(cursor: Cursor): RepeatHead {
  if (cursor.isKeyword('forever')) {
    cursor.next()
    return { kind: 'forever' }
  }
  if (cursor.isKeyword('while')) {
    cursor.next()
    return { kind: 'while', condition: parseExpression(cursor) }
  }
  if (cursor.isKeyword('with')) {
    cursor.next()
    const variable = cursor.peek()
    if (variable.kind !== 'identifier' || cursor.isReserved()) cursor.expected('a variable name')
    cursor.next()
    cursor.expectOperator('=')
    const from = parseExpression(cursor)
    let direction: 'up' | 'down' = 'up'
    if (cursor.isKeyword('down')) {
      cursor.next()
      direction = 'down'
    }
    cursor.expectKeyword('to', direction === 'down' ? '"to"' : '"to" or "down to"')
    const to = parseExpression(cursor)
    return { kind: 'with', variable: variable.text, from, direction, to }
  }
  const count = parseExpression(cursor)
  cursor.expectKeyword('times')
  return { kind: 'times', count }
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
