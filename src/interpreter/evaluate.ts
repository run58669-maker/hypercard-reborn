// Expression evaluator (design.md §5.3): evaluates every expression node
// against a Host and a variable map. Runtime errors are returned, never
// thrown, with the position of the node that failed.
import type { Expression, Position } from '../parser'
import type { Host } from './host'
import { arithmetic, checkLength, compare, fromBoolean, renderNumber, toBoolean, toNumber } from './values'

export interface EvalContext {
  readonly host: Host
  /** Keyed by lower-cased name. */
  readonly variables: Map<string, string>
  /** The clicked button's name; '' inside openCard. */
  readonly target: string
}

export interface EvalError extends Position {
  readonly message: string
}

export type EvalResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: EvalError }

function fail(node: Position, message: string): EvalResult {
  return { ok: false, error: { message, line: node.line, column: node.column } }
}

function ok(value: string): EvalResult {
  return { ok: true, value }
}

/** `11/1/26`: month/day/two-digit year, no padding. */
export function formatDate(date: Date): string {
  const year = date.getFullYear() % 100
  return `${date.getMonth() + 1}/${date.getDate()}/${String(year).padStart(2, '0')}`
}

/** `3:04 PM`: 12-hour clock, hour unpadded from 1 to 12, minute padded. */
export function formatTime(date: Date): string {
  const hours = date.getHours()
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

export function evaluate(expression: Expression, context: EvalContext): EvalResult {
  switch (expression.kind) {
    case 'number':
      return ok(expression.text)
    case 'string':
      return ok(expression.value)
    case 'constant':
      switch (expression.name) {
        case 'true':
          return ok('true')
        case 'false':
          return ok('false')
        case 'empty':
          return ok('')
        case 'quote':
          return ok('"')
        case 'return':
          return ok('\n')
      }
      break
    case 'variable':
      // An unset variable yields its own name as spelled at the reading site.
      return ok(context.variables.get(expression.name.toLowerCase()) ?? expression.name)
    case 'objectRef': {
      if (expression.objectKind === 'field') {
        const text = context.host.getFieldText(expression.name)
        return text === undefined ? fail(expression, `field "${expression.name}" does not exist`) : ok(text)
      }
      const name = context.host.getName('button', expression.name)
      return name === undefined ? fail(expression, `button "${expression.name}" does not exist`) : ok(name)
    }
    case 'builtin':
      switch (expression.name) {
        case 'date':
          return ok(formatDate(context.host.now()))
        case 'time':
          return ok(formatTime(context.host.now()))
        case 'target':
          return ok(context.target)
      }
      break
    case 'unary': {
      const operand = evaluate(expression.operand, context)
      if (!operand.ok) return operand
      if (expression.operator === 'not') {
        const b = toBoolean(operand.value)
        return b.ok ? ok(fromBoolean(!b.value)) : fail(expression, b.message)
      }
      const n = toNumber(operand.value)
      if (!n.ok) return fail(expression, n.message)
      const rendered = renderNumber(-n.value)
      return rendered.ok ? ok(rendered.value) : fail(expression, rendered.message)
    }
    case 'binary': {
      // Both operands are always evaluated, left to right (no short-circuit).
      const left = evaluate(expression.left, context)
      if (!left.ok) return left
      const right = evaluate(expression.right, context)
      if (!right.ok) return right
      return binary(expression, left.value, right.value)
    }
  }
}

function binary(node: Expression & { kind: 'binary' }, left: string, right: string): EvalResult {
  const lift = (result: { ok: true; value: string } | { ok: false; message: string }): EvalResult =>
    result.ok ? ok(result.value) : fail(node, result.message)
  switch (node.operator) {
    case 'or':
    case 'and': {
      const a = toBoolean(left)
      if (!a.ok) return fail(node, a.message)
      const b = toBoolean(right)
      if (!b.ok) return fail(node, b.message)
      return ok(fromBoolean(node.operator === 'or' ? a.value || b.value : a.value && b.value))
    }
    case '=':
    case 'is':
      return ok(fromBoolean(compare(left, right) === 0))
    case '<>':
    case 'is not':
      return ok(fromBoolean(compare(left, right) !== 0))
    case '<':
      return ok(fromBoolean(compare(left, right) < 0))
    case '>':
      return ok(fromBoolean(compare(left, right) > 0))
    case '<=':
      return ok(fromBoolean(compare(left, right) <= 0))
    case '>=':
      return ok(fromBoolean(compare(left, right) >= 0))
    case '&':
      return lift(checkLength(left + right))
    case '&&':
      return lift(checkLength(`${left} ${right}`))
    case '+':
    case '-':
    case '*':
    case '/':
    case 'div':
    case 'mod':
      return lift(arithmetic(node.operator, left, right))
  }
}
