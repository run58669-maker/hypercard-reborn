// Token cursor shared by parser.ts and expressions.ts. Not exported from the
// module index; it is an implementation detail of the recursive-descent parser.
import type { ParseError } from './errors'
import { sourceLine } from './errors'
import type { Token } from './lexer'

/** Thrown inside the parser and caught by `parse()`, which never lets it escape. */
export class Failure extends Error {
  constructor(readonly error: ParseError) {
    super(error.message)
  }
}

/** The `Y` in "expected X, found Y" for a token. */
export function found(token: Token): string {
  switch (token.kind) {
    case 'newline':
      return 'newline'
    case 'eof':
      return 'end of script'
    case 'string':
      return token.text
    default:
      return `"${token.text}"`
  }
}

/**
 * The deepest a script may nest (design.md §4.4, requirement 7.4). The tree
 * the parser returns is never deeper than this many levels, so every
 * recursive walk over it (interpreter, printer, object check) stays far from
 * the engine's stack limit.
 */
export const MAX_NESTING = 64

export class Cursor {
  private index = 0
  /** Levels open at the current token (design.md §4.4). */
  private depth = 0
  /**
   * The deepest level reached since the innermost open chain started (see
   * `startChain`). A chain reads it to place each operator's node one level
   * above everything its left operand reached.
   */
  private reached = 0

  constructor(
    private readonly source: string,
    private readonly tokens: readonly Token[],
  ) {}

  peek(offset = 0): Token {
    const token = this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1]
    if (token === undefined) throw new Error('lexer produced no tokens')
    return token
  }

  next(): Token {
    const token = this.peek()
    if (token.kind !== 'eof') this.index += 1
    return token
  }

  isKeyword(word: string, token: Token = this.peek()): boolean {
    return token.kind === 'keyword' && token.text.toLowerCase() === word
  }

  isIdentifier(word: string, token: Token = this.peek()): boolean {
    return token.kind === 'identifier' && token.text.toLowerCase() === word
  }

  isOperator(op: string, token: Token = this.peek()): boolean {
    return token.kind === 'operator' && token.text === op
  }

  /** `down` is lexed as an identifier outside `down to` but is reserved all the same. */
  isReserved(token: Token = this.peek()): boolean {
    return token.kind === 'keyword' || (token.kind === 'identifier' && token.text.toLowerCase() === 'down')
  }

  fail(message: string, token: Token = this.peek()): never {
    throw new Failure({
      line: token.line,
      column: token.column,
      message,
      near: token.kind === 'eof' ? '' : sourceLine(this.source, token.line),
    })
  }

  expected(what: string, token: Token = this.peek()): never {
    return this.fail(`expected ${what}, found ${found(token)}`, token)
  }

  expectKeyword(word: string, shown = `"${word}"`): Token {
    if (!this.isKeyword(word)) this.expected(shown)
    return this.next()
  }

  expectOperator(op: string): Token {
    if (!this.isOperator(op)) this.expected(`"${op}"`)
    return this.next()
  }

  expectNewline(): Token {
    if (this.peek().kind !== 'newline') this.expected('newline')
    return this.next()
  }

  /** Opens one level at `token`; fails there if that is level MAX_NESTING + 1. */
  enter(token: Token): void {
    this.depth += 1
    this.reach(this.depth, token)
  }

  /** Closes levels opened by `enter`. Not needed on the error path: a Cursor serves one parse. */
  leave(levels = 1): void {
    this.depth -= levels
  }

  /**
   * Starts a left-associative chain (or a comparison) at the current depth.
   * Returns what `endChain` restores.
   */
  startChain(): number {
    const outer = this.reached
    this.reached = this.depth
    return outer
  }

  /**
   * An operator applied in the chain at `token`. Its node sits one level above
   * the deepest level its left operand reached, which may be far above the
   * chain's start when that operand is parenthesised or is itself a chain.
   * Fails at `token` if that is level MAX_NESTING + 1.
   */
  chainOperator(token: Token): void {
    this.reach(this.reached + 1, token)
  }

  /** Ends the chain started by `startChain`, keeping what it reached for any enclosing chain. */
  endChain(outer: number): void {
    this.reached = Math.max(outer, this.reached)
  }

  private reach(level: number, token: Token): void {
    // "too long" because a flat chain of 65 operators is 65 levels as well (design.md §4.4).
    if (level > MAX_NESTING) this.fail(`expression too long or nested too deeply (limit ${String(MAX_NESTING)})`, token)
    if (level > this.reached) this.reached = level
  }

  skipNewlines(): void {
    while (this.peek().kind === 'newline') this.next()
  }
}
