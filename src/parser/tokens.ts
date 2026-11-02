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

export class Cursor {
  private index = 0

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

  skipNewlines(): void {
    while (this.peek().kind === 'newline') this.next()
  }
}
