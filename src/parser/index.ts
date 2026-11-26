// Public surface of the parser module (design.md §2): parse(), the nesting
// limit (§4.4) and the types.
export { parse } from './parser'
export { MAX_NESTING } from './tokens'
export type * from './ast'
export type { ParseError, ParseResult } from './errors'
