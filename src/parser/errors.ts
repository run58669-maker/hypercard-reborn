// Parse error and result types (design.md §4.1, docs/grammar.md §6).
import type { Program } from './ast'

export interface ParseError {
  /** 1-based line of the offending token; `\r\n` counts as one newline. */
  readonly line: number
  /** 1-based column of the offending token, in UTF-16 code units. */
  readonly column: number
  /** Phrased as "expected X, found Y"; tests assert on the whole string. */
  readonly message: string
  /** The full text of the source line (without its newline), or '' at end of input. */
  readonly near: string
}

export type ParseResult = { readonly ok: true; readonly program: Program } | { readonly ok: false; readonly error: ParseError }

/** The text of line `line` (1-based) of `source`, without its newline, for `ParseError.near`. */
export function sourceLine(source: string, line: number): string {
  const lines = source.split(/\r\n|\n/)
  return lines[line - 1] ?? ''
}
