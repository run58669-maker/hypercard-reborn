// fast-check generators for programs, statements and expressions, defined
// once here and reused by every property test (testing.md). Positions are
// all 0; compare trees with `withoutPositions`.
import fc from 'fast-check'
import type {
  BuiltinName,
  ConstantName,
  Container,
  Expression,
  Handler,
  HandlerName,
  ObjectKind,
  ObjectRef,
  Program,
  Property,
  RepeatHead,
  Statement,
  UnaryOperator,
} from './ast'
import { KEYWORDS } from './lexer'

const at = { line: 0, column: 0 }

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const WORD_CHARS = `${LETTERS}0123456789_`

/** A short identifier that is not a reserved word (so it can name a variable). */
export const arbIdentifier: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...LETTERS), fc.array(fc.constantFrom(...WORD_CHARS), { maxLength: 4 }))
  .map(([first, rest]) => first + rest.join(''))
  .filter((name) => !KEYWORDS.has(name.toLowerCase()))

/** An object name: no double quote, no newline. */
export const arbObjectName: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9 _!?.,-]{1,10}$/)

/** A string literal value: printable ASCII without the double quote. */
export const arbStringValue: fc.Arbitrary<string> = fc.stringMatching(/^[ -!#-~]{0,8}$/)

export const arbNumberText: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0, max: 999 }).map(String),
  fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 })).map(([a, b]) => `${a}.${b}`),
)

export const arbObjectRef: fc.Arbitrary<ObjectRef> = fc
  .tuple(fc.constantFrom<ObjectKind>('field', 'button'), arbObjectName)
  .map(([objectKind, name]) => ({ kind: 'objectRef', objectKind, name, ...at }))

const arbLeaf: fc.Arbitrary<Expression> = fc.oneof(
  arbNumberText.map((text) => ({ kind: 'number', text, ...at }) satisfies Expression),
  arbStringValue.map((value) => ({ kind: 'string', value, ...at }) satisfies Expression),
  fc.constantFrom<ConstantName>('true', 'false', 'empty', 'quote', 'return').map(
    (name) => ({ kind: 'constant', name, ...at }) satisfies Expression,
  ),
  arbIdentifier.map((name) => ({ kind: 'variable', name, ...at }) satisfies Expression),
  arbObjectRef,
  fc.constantFrom<BuiltinName>('date', 'time', 'target').map((name) => ({ kind: 'builtin', name, ...at }) satisfies Expression),
)

const BINARY_OPERATORS = [
  'or', 'and', '=', '<>', '<', '>', '<=', '>=', 'is', 'is not', '&', '&&', '+', '-', '*', '/', 'div', 'mod',
] as const

export const arbExpression: fc.Arbitrary<Expression> = fc.letrec<{ expr: Expression }>((tie) => ({
  expr: fc.oneof(
    { depthSize: 'small', maxDepth: 4, withCrossShrink: true },
    arbLeaf,
    fc
      .tuple(fc.constantFrom(...BINARY_OPERATORS), tie('expr'), tie('expr'))
      .map(([operator, left, right]) => ({ kind: 'binary', operator, left, right, ...at }) satisfies Expression),
    fc
      .tuple(fc.constantFrom<UnaryOperator>('not', '-'), tie('expr'))
      .map(([operator, operand]) => ({ kind: 'unary', operator, operand, ...at }) satisfies Expression),
  ),
})).expr

const arbContainer: fc.Arbitrary<Container> = fc.oneof(
  arbIdentifier.map((name) => ({ kind: 'variable', name, ...at }) satisfies Container),
  arbObjectName.map((name) => ({ kind: 'objectRef', objectKind: 'field', name, ...at }) satisfies Container),
)

const arbRepeatHead: fc.Arbitrary<RepeatHead> = fc.oneof(
  fc.constant({ kind: 'forever' } satisfies RepeatHead),
  arbExpression.map((count) => ({ kind: 'times', count }) satisfies RepeatHead),
  arbExpression.map((condition) => ({ kind: 'while', condition }) satisfies RepeatHead),
  fc
    .tuple(arbIdentifier, arbExpression, fc.constantFrom<'up' | 'down'>('up', 'down'), arbExpression)
    .map(([variable, from, direction, to]) => ({ kind: 'with', variable, from, direction, to }) satisfies RepeatHead),
)

/** A single-line `if` branch may not itself be an `if` or a `repeat`. */
function isSimple(statement: Statement): boolean {
  return statement.kind !== 'if' && statement.kind !== 'repeat'
}

/**
 * The parser attaches an `else` on the line after a single-line `if` to that
 * `if`, so a block `if` with an `else` cannot end its then-branch with a
 * single-line `if` that has no `else`. Such a tree can never come out of the
 * parser, so the generator does not produce it either.
 */
function endsWithOpenSingleIf(statements: readonly Statement[]): boolean {
  const last = statements[statements.length - 1]
  return last !== undefined && last.kind === 'if' && last.form === 'single' && last.else === null
}

export const arbStatement: fc.Arbitrary<Statement> = fc.letrec<{ stmt: Statement; simple: Statement }>((tie) => {
  const simple: fc.Arbitrary<Statement> = fc.oneof(
    fc
      .tuple(arbExpression, fc.option(arbContainer, { nil: null }))
      .map(([value, into]) => ({ kind: 'put', value, into, ...at }) satisfies Statement),
    fc
      .tuple(fc.constantFrom<Property>('visible', 'enabled', 'name'), arbObjectRef, arbExpression)
      .map(([property, object, value]) => ({ kind: 'set', property, object, value, ...at }) satisfies Statement),
    arbExpression.map((value) => ({ kind: 'get', value, ...at }) satisfies Statement),
    arbExpression.map((value) => ({ kind: 'answer', value, ...at }) satisfies Statement),
    arbExpression.map((card) => ({ kind: 'go', card, ...at }) satisfies Statement),
    arbObjectRef.map((object) => ({ kind: 'show', object, ...at }) satisfies Statement),
    arbObjectRef.map((object) => ({ kind: 'hide', object, ...at }) satisfies Statement),
  )
  const body = fc.array(tie('stmt'), { maxLength: 3 })
  return {
    simple,
    stmt: fc.oneof(
      { depthSize: 'small', maxDepth: 3, withCrossShrink: true },
      simple,
      fc
        .tuple(arbExpression, tie('simple'), fc.option(tie('simple'), { nil: null }))
        .filter(([, thenStatement, elseStatement]) => isSimple(thenStatement) && (elseStatement === null || isSimple(elseStatement)))
        .map(
          ([condition, thenStatement, elseStatement]) =>
            ({
              kind: 'if',
              form: 'single',
              condition,
              then: [thenStatement],
              else: elseStatement === null ? null : [elseStatement],
              ...at,
            }) satisfies Statement,
        ),
      fc
        .tuple(arbExpression, body, fc.option(body, { nil: null }))
        .filter(([, thenBody, elseBody]) => elseBody === null || !endsWithOpenSingleIf(thenBody))
        .map(
          ([condition, thenBody, elseBody]) =>
            ({ kind: 'if', form: 'block', condition, then: thenBody, else: elseBody, ...at }) satisfies Statement,
        ),
      fc.tuple(arbRepeatHead, body).map(([head, repeatBody]) => ({ kind: 'repeat', head, body: repeatBody, ...at }) satisfies Statement),
    ),
  }
}).stmt

const arbHandlerNames: fc.Arbitrary<HandlerName[]> = fc.constantFrom<HandlerName[]>(
  [],
  ['openCard'],
  ['mouseUp'],
  ['openCard', 'mouseUp'],
  ['mouseUp', 'openCard'],
)

export const arbProgram: fc.Arbitrary<Program> = arbHandlerNames
  .chain((names) =>
    fc.tuple(...names.map((name) => fc.array(arbStatement, { maxLength: 4 }).map((body): Handler => ({ kind: 'handler', name, body, ...at })))),
  )
  .map((handlers) => ({ source: '', handlers }))

/** The same tree with every `line`, `column` and the program `source` removed, for structural comparison. */
export function withoutPositions<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => withoutPositions(item)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === 'line' || key === 'column' || key === 'source') continue
      out[key] = withoutPositions(item)
    }
    return out as T
  }
  return value
}
