// Scripts nested a chosen number of levels deep, one per construct that pays a
// level under design.md §4.4 (task 18.1). Test support, like arbitraries.ts:
// the nesting tests in src/parser, src/interpreter and src/compile share them,
// and nothing in the app imports this file.

export interface Position {
  readonly line: number
  readonly column: number
}

export interface DeepScript {
  readonly label: string
  /** One `on mouseUp` handler whose body spends `levels` levels and runs without a runtime error. */
  readonly source: string
  /** Line and column of the token that opens level `level` (1-based, at most `levels`). */
  readonly opener: (level: number) => Position
}

/** Every operator that can be applied in a chain, with an operand it runs on. */
export const CHAIN_OPERATORS: ReadonlyArray<readonly [operator: string, operand: string]> = [
  ['or', 'true'],
  ['and', 'true'],
  ['&', '"a"'],
  ['&&', '"a"'],
  ['+', '1'],
  ['-', '1'],
  ['*', '1'],
  ['/', '1'],
  ['div', '1'],
  ['mod', '1'],
]

const PUT = '  put '

function handler(body: string): string {
  return `on mouseUp\n${body}end mouseUp\n`
}

/** `levels` nested `(`. */
export function parentheses(levels: number): DeepScript {
  return {
    label: `${String(levels)} parentheses`,
    source: handler(`${PUT}${'('.repeat(levels)}1${')'.repeat(levels)} into x\n`),
    opener: (level) => ({ line: 2, column: PUT.length + level }),
  }
}

/** `levels` times `not`. */
export function nots(levels: number): DeepScript {
  return {
    label: `${String(levels)} not`,
    source: handler(`${PUT}${'not '.repeat(levels)}true into x\n`),
    opener: (level) => ({ line: 2, column: PUT.length + 1 + 4 * (level - 1) }),
  }
}

/** `levels` times unary `-` (spaced: `--` starts a comment). */
export function minuses(levels: number): DeepScript {
  return {
    label: `${String(levels)} unary -`,
    source: handler(`${PUT}${'- '.repeat(levels)}1 into x\n`),
    opener: (level) => ({ line: 2, column: PUT.length + 1 + 2 * (level - 1) }),
  }
}

/** A left-associative chain of `levels` applications of one operator. */
export function chain(operator: string, operand: string, levels: number): DeepScript {
  const step = ` ${operator} ${operand}`
  return {
    label: `a chain of ${String(levels)} "${operator}"`,
    source: handler(`${PUT}${operand}${step.repeat(levels)} into x\n`),
    opener: (level) => ({ line: 2, column: PUT.length + operand.length + 2 + step.length * (level - 1) }),
  }
}

/**
 * A comparison takes one operator, so it cannot chain: `levels - 1`
 * parentheses around one comparison, whose operator opens the last level.
 */
export function comparison(operator: '=' | 'is not', levels: number): DeepScript {
  const open = levels - 1
  return {
    label: `"${operator}" inside ${String(open)} parentheses`,
    source: handler(`${PUT}${'('.repeat(open)}1 ${operator} 2${')'.repeat(open)} into x\n`),
    opener: (level) => ({ line: 2, column: PUT.length + level + (level > open ? 2 : 0) }),
  }
}

/** `levels` nested block `if`, each in the then body of the one before. */
export function ifs(levels: number): DeepScript {
  return {
    label: `${String(levels)} nested block if`,
    source: handler(`${'if true then\n'.repeat(levels)}put 1 into x\n${'end if\n'.repeat(levels)}`),
    opener: (level) => ({ line: 1 + level, column: 1 }),
  }
}

/** `levels` nested block `if`, each in the else body of the one before. */
export function elseIfs(levels: number): DeepScript {
  return {
    label: `${String(levels)} block if nested in else`,
    source: handler(`${'if false then\nput 1 into y\nelse\n'.repeat(levels)}put 1 into x\n${'end if\n'.repeat(levels)}`),
    opener: (level) => ({ line: 2 + 3 * (level - 1), column: 1 }),
  }
}

/** `levels` nested `repeat`. */
export function repeats(levels: number): DeepScript {
  return {
    label: `${String(levels)} nested repeat`,
    source: handler(`${'repeat 1 times\n'.repeat(levels)}put 1 into x\n${'end repeat\n'.repeat(levels)}`),
    opener: (level) => ({ line: 1 + level, column: 1 }),
  }
}

/**
 * 15 nested `if`, inside them a chain of 20 `+` whose first operand is
 * `levels - 35` nested parentheses: the parentheses sit under all 20 operator
 * nodes, so the operators open levels 16 + parentheses and up.
 */
export function mix(levels: number): DeepScript {
  const blocks = 15
  const operators = 20
  const open = levels - blocks - operators
  const line = `put ${'('.repeat(open)}1${')'.repeat(open)}${' + 1'.repeat(operators)} into x\n`
  return {
    label: `${String(open)} parentheses inside ${String(operators)} "+" inside ${String(blocks)} if`,
    source: handler(`${'if true then\n'.repeat(blocks)}${line}${'end if\n'.repeat(blocks)}`),
    opener: (level) => {
      if (level <= blocks) return { line: 1 + level, column: 1 }
      if (level <= blocks + open) return { line: 2 + blocks, column: 4 + level - blocks }
      return { line: 2 + blocks, column: 2 * open + 7 + 4 * (level - blocks - open - 1) }
    },
  }
}

/** One script per construct, each spending exactly `levels` levels (at least 35, for the mix). */
export function deepScripts(levels: number): DeepScript[] {
  return [
    parentheses(levels),
    nots(levels),
    minuses(levels),
    ...CHAIN_OPERATORS.map(([operator, operand]) => chain(operator, operand, levels)),
    comparison('=', levels),
    comparison('is not', levels),
    ifs(levels),
    elseIfs(levels),
    repeats(levels),
    mix(levels),
  ]
}
