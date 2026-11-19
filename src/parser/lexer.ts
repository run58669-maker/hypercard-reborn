// Hand-written lexer for docs/grammar.md §1 (details: design.md §4.2).
//
// `lex(source)` never throws. It returns every token with its exact source
// slice (`text`) and the trivia (spaces, tabs, `--` comments) skipped just
// before it, so that concatenating `trivia + text` over all tokens reproduces
// the input byte for byte (the lossless-lexing property, task 2.3).
import type { ParseError } from './errors'
import { sourceLine } from './errors'

export type TokenKind = 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'newline' | 'eof'

export interface Token {
  readonly kind: TokenKind
  /** The exact source slice. '' for the synthetic end-of-input newline and for eof. */
  readonly text: string
  readonly line: number
  readonly column: number
  /** Whitespace and comments skipped immediately before this token. */
  readonly trivia: string
}

export type LexResult = { readonly ok: true; readonly tokens: readonly Token[] } | { readonly ok: false; readonly error: ParseError }

/**
 * The reserved words of docs/grammar.md §1, lower-cased. `down` is in the list
 * (it can never be a variable name) but is lexed as a keyword only in `down to`;
 * elsewhere it is an identifier that the parser still treats as reserved.
 */
export const KEYWORDS: ReadonlySet<string> = new Set([
  'on', 'end', 'if', 'then', 'else', 'repeat', 'with', 'to', 'down', 'times', 'while', 'forever',
  'put', 'into', 'set', 'get', 'go', 'card', 'field', 'button', 'show', 'hide', 'answer', 'the',
  'and', 'or', 'not', 'is', 'div', 'mod', 'true', 'false', 'quote', 'empty', 'return',
])

/** Operators by longest match first. */
const OPERATORS = ['&&', '<=', '>=', '<>', '&', '<', '>', '=', '+', '-', '*', '/', '(', ')'] as const

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

export function lex(source: string): LexResult {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let column = 1
  let trivia = ''

  const fail = (message: string, atLine: number, atColumn: number, atEnd: boolean): LexResult => ({
    ok: false,
    error: { line: atLine, column: atColumn, message, near: atEnd ? '' : sourceLine(source, atLine) },
  })

  const push = (kind: TokenKind, text: string, atLine: number, atColumn: number): void => {
    tokens.push({ kind, text, line: atLine, column: atColumn, trivia })
    trivia = ''
  }

  while (pos < source.length) {
    const ch = source[pos] as string

    // Trivia: spaces, tabs, comments.
    if (ch === ' ' || ch === '\t') {
      trivia += ch
      pos += 1
      column += 1
      continue
    }
    if (ch === '-' && source[pos + 1] === '-') {
      // A comment runs to the next newline (`\n` or `\r\n`); a lone `\r` is
      // not a line ending and stays inside the comment.
      let end = pos
      while (end < source.length && source[end] !== '\n' && !(source[end] === '\r' && source[end + 1] === '\n')) {
        end += 1
      }
      trivia += source.slice(pos, end)
      column += end - pos
      pos = end
      continue
    }

    // Newlines.
    if (ch === '\n' || (ch === '\r' && source[pos + 1] === '\n')) {
      const text = ch === '\n' ? '\n' : '\r\n'
      push('newline', text, line, column)
      pos += text.length
      line += 1
      column = 1
      continue
    }

    // Strings: no escapes, may not span a newline.
    if (ch === '"') {
      let end = pos + 1
      while (end < source.length) {
        const c = source[end] as string
        if (c === '"') break
        if (c === '\n' || (c === '\r' && source[end + 1] === '\n')) {
          return fail('expected closing quote, found newline', line, column + (end - pos), false)
        }
        end += 1
      }
      if (end >= source.length) {
        return fail('expected closing quote, found end of script', line, column + (end - pos), true)
      }
      const text = source.slice(pos, end + 1)
      push('string', text, line, column)
      pos = end + 1
      column += text.length
      continue
    }

    // Numbers: digit { digit } [ "." digit { digit } ].
    if (isDigit(ch)) {
      let end = pos + 1
      while (end < source.length && isDigit(source[end] as string)) end += 1
      if (source[end] === '.' && end + 1 < source.length && isDigit(source[end + 1] as string)) {
        end += 2
        while (end < source.length && isDigit(source[end] as string)) end += 1
      }
      const text = source.slice(pos, end)
      push('number', text, line, column)
      pos = end
      column += text.length
      continue
    }

    // Identifiers and keywords.
    if (isLetter(ch)) {
      let end = pos + 1
      while (end < source.length) {
        const c = source[end] as string
        if (isLetter(c) || isDigit(c) || c === '_') end += 1
        else break
      }
      const text = source.slice(pos, end)
      const lower = text.toLowerCase()
      let kind: TokenKind = 'identifier'
      if (lower === 'down') {
        // `down` is a keyword only in the phrase `down to`.
        let look = end
        while (look < source.length && (source[look] === ' ' || source[look] === '\t')) look += 1
        const next = source.slice(look, look + 2).toLowerCase()
        const after = source[look + 2]
        const nextIsWord = after !== undefined && (isLetter(after) || isDigit(after) || after === '_')
        if (next === 'to' && !nextIsWord) kind = 'keyword'
      } else if (KEYWORDS.has(lower)) {
        kind = 'keyword'
      }
      push(kind, text, line, column)
      pos = end
      column += text.length
      continue
    }

    // Operators, longest match first.
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, pos))
    if (op !== undefined) {
      push('operator', op, line, column)
      pos += op.length
      column += op.length
      continue
    }

    return fail(`unexpected character "${ch}"`, line, column, false)
  }

  // End of input counts as a newline (grammar §1): a synthetic newline token
  // carries any trailing trivia, then eof.
  push('newline', '', line, column)
  push('eof', '', line, column)
  return { ok: true, tokens }
}
