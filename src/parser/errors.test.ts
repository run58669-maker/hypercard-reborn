import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { KEYWORDS } from './lexer'
import { parse } from './parser'

// One malformed script per row of design.md §4.3 plus edge cases. The
// snapshot freezes line, column, message and near; a change to it needs a
// sentence in the commit message saying why (testing.md).
const MALFORMED: ReadonlyArray<[label: string, source: string]> = [
  ['wrong token', 'on mouseUp\n  put 1 2\nend mouseUp\n'],
  ['unknown character', 'on mouseUp\n  put ~\nend mouseUp\n'],
  ['unterminated string at newline', 'on mouseUp\n  put "abc\nend mouseUp\n'],
  ['unterminated string at end of script', 'on mouseUp\n  put "abc'],
  ['duplicate handler', 'on mouseUp\nend mouseUp\n\non mouseUp\nend mouseUp\n'],
  ['end names a different handler', 'on mouseUp\n  put 1\nend openCard\n'],
  ['unknown handler name', 'on foo\nend foo\n'],
  ['reserved word as variable', 'on mouseUp\n  put 1 into end\nend mouseUp\n'],
  ['put into button', 'on mouseUp\n  put "x" into button "b"\nend mouseUp\n'],
  ['unknown property in set', 'on mouseUp\n  set x of field "f" to 1\nend mouseUp\n'],
  ['block statement after single-line then', 'on mouseUp\n  if a then if b then put 1\nend mouseUp\n'],
  ['block statement after single-line else', 'on mouseUp\n  if a then put 1\n  else repeat forever\n  end repeat\nend mouseUp\n'],
  ['statement outside a handler', 'put 1\n'],
  ['empty handler missing end', 'on mouseUp\n'],
  ['end at end of input', 'on mouseUp\nend'],
  ['missing then', 'on mouseUp\n  if x\n  end if\nend mouseUp\n'],
  ['end if closes a repeat', 'on mouseUp\n  repeat 3 times\n    put 1\n  end if\nend mouseUp\n'],
  ['chained comparison', 'on mouseUp\n  put a = b = c\nend mouseUp\n'],
  ['missing closing parenthesis', 'on mouseUp\n  put (1 + 2\nend mouseUp\n'],
  ['unknown built-in', 'on mouseUp\n  put the mouseLoc\nend mouseUp\n'],
  ['else without if', 'on mouseUp\n  else\nend mouseUp\n'],
  ['repeat with reserved counter', 'on mouseUp\n  repeat with to = 1 to 3\n  end repeat\nend mouseUp\n'],
  ['go without card', 'on mouseUp\n  go 2\nend mouseUp\n'],
  ['crlf line endings', 'on mouseUp\r\n  put 1 2\r\nend mouseUp\r\n'],
]

describe('parse errors', () => {
  it.each(MALFORMED)('%s', (_label, source) => {
    const result = parse(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatchSnapshot()
  })

  it('covers at least twenty malformed scripts', () => {
    expect(MALFORMED.length).toBeGreaterThanOrEqual(20)
  })
})

describe('properties', () => {
  const keyword = fc.constantFrom(...KEYWORDS)
  const glue = fc.constantFrom(' ', '\n', '\r\n', '\t', '', '"', '(', ')', '=', '&', '--', '1', 'x')
  const keywordSoup = fc
    .array(fc.oneof(keyword, glue, fc.string({ maxLength: 3 })), { maxLength: 20 })
    .map((parts) => parts.join(''))

  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (source) => {
        expect(() => parse(source)).not.toThrow()
      }),
      { numRuns: 200 },
    )
  })

  it('never throws on strings glued together from grammar keywords', () => {
    fc.assert(
      fc.property(keywordSoup, (source) => {
        const result = parse(source)
        expect(result.ok === true || result.ok === false).toBe(true)
        if (!result.ok) {
          expect(result.error.line).toBeGreaterThanOrEqual(1)
          expect(result.error.column).toBeGreaterThanOrEqual(1)
          expect(result.error.message.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('returns the source by reference whenever it parses', () => {
    fc.assert(
      fc.property(keywordSoup, (source) => {
        const result = parse(source)
        if (result.ok) expect(result.program.source).toBe(source)
      }),
      { numRuns: 200 },
    )
  })
})
