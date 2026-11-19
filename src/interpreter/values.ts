// Value semantics for docs/grammar.md §4 and design.md §5.3. Every value is a
// string. Errors are returned as `{ ok: false, message }`, never thrown.

export type ValueResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

/** 64 KiB in UTF-16 code units (grammar §7). */
export const MAX_VALUE_LENGTH = 65_536

const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/

/** Strips leading and trailing spaces and tabs only (not other whitespace). */
function stripSpaces(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && (value[start] === ' ' || value[start] === '\t')) start += 1
  while (end > start && (value[end - 1] === ' ' || value[end - 1] === '\t')) end -= 1
  return value.slice(start, end)
}

/** The value as shown in an error message: at most 40 characters. */
export function shown(value: string): string {
  return `"${value.length > 40 ? value.slice(0, 40) : value}"`
}

export function isNumeric(value: string): boolean {
  return NUMERIC.test(stripSpaces(value))
}

export function toNumber(value: string): ValueResult<number> {
  if (!isNumeric(value)) return { ok: false, message: `expected a number, found ${shown(value)}` }
  return { ok: true, value: Number(stripSpaces(value)) }
}

/**
 * Integers below 1e21 in magnitude render with String(); anything else with
 * up to six decimals, trailing zeros (and a trailing dot) removed. A result
 * that is not finite is the runtime error `number out of range`.
 */
export function renderNumber(n: number): ValueResult<string> {
  if (!Number.isFinite(n)) return { ok: false, message: 'number out of range' }
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return { ok: true, value: String(n) }
  let text = n.toFixed(6)
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  if (text === '-0') text = '0'
  return { ok: true, value: text }
}

export type ArithmeticOperator = '+' | '-' | '*' | '/' | 'div' | 'mod'

/** `a op b` for the arithmetic operators, including the division-by-zero rule. */
export function arithmetic(operator: ArithmeticOperator, left: string, right: string): ValueResult<string> {
  const a = toNumber(left)
  if (!a.ok) return a
  const b = toNumber(right)
  if (!b.ok) return b
  let result: number
  switch (operator) {
    case '+':
      result = a.value + b.value
      break
    case '-':
      result = a.value - b.value
      break
    case '*':
      result = a.value * b.value
      break
    case '/':
      if (b.value === 0) return { ok: false, message: 'division by zero' }
      result = a.value / b.value
      break
    case 'div':
      if (b.value === 0) return { ok: false, message: 'division by zero' }
      result = Math.trunc(a.value / b.value)
      break
    case 'mod':
      if (b.value === 0) return { ok: false, message: 'division by zero' }
      result = a.value % b.value
      break
  }
  return renderNumber(result)
}

/**
 * -1, 0 or 1: numerically when both sides are numeric, otherwise by the
 * lower-cased UTF-16 code units.
 */
export function compare(left: string, right: string): -1 | 0 | 1 {
  if (isNumeric(left) && isNumeric(right)) {
    const a = Number(stripSpaces(left))
    const b = Number(stripSpaces(right))
    return a < b ? -1 : a > b ? 1 : 0
  }
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  return a < b ? -1 : a > b ? 1 : 0
}

export function toBoolean(value: string): ValueResult<boolean> {
  const lower = value.toLowerCase()
  if (lower === 'true') return { ok: true, value: true }
  if (lower === 'false') return { ok: true, value: false }
  return { ok: false, message: `expected true or false, found ${shown(value)}` }
}

export function fromBoolean(value: boolean): string {
  return value ? 'true' : 'false'
}

/** The value itself, or the runtime error `value too long` past 64 KiB. */
export function checkLength(value: string): ValueResult<string> {
  if (value.length > MAX_VALUE_LENGTH) return { ok: false, message: 'value too long' }
  return { ok: true, value }
}
