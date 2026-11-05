import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { lex, type Token } from './lexer'

function tokensOf(source: string): Token[] {
  const result = lex(source)
  if (!result.ok) throw new Error(`lex failed: ${result.error.message}`)
  return [...result.tokens]
}

/** `kind:text` for every token except the synthetic newline and eof. */
function summary(source: string): string[] {
  return tokensOf(source)
    .filter((t) => t.kind !== 'eof' && !(t.kind === 'newline' && t.text === ''))
    .map((t) => `${t.kind}:${t.text}`)
}

describe('lex', () => {
  it.each([
    ['on', ['keyword:on']],
    ['MouseUp', ['identifier:MouseUp']],
    ['Total_1', ['identifier:Total_1']],
    ['42', ['number:42']],
    ['3.14', ['number:3.14']],
    ['"Hello, world!"', ['string:"Hello, world!"']],
    ['&&', ['operator:&&']],
    ['<=', ['operator:<=']],
    ['\n', ['newline:\n']],
    ['\r\n', ['newline:\r\n']],
  ])('lexes %j as one token of the right class', (source, expected) => {
    expect(summary(source)).toEqual(expected)
  })

  it('matches keywords case-insensitively and keeps the text as written', () => {
    expect(summary('PUT Repeat eNd')).toEqual(['keyword:PUT', 'keyword:Repeat', 'keyword:eNd'])
  })

  it('does not reserve contextual words like visible, of, date', () => {
    expect(summary('set visible of field "x" to the date')).toEqual([
      'keyword:set',
      'identifier:visible',
      'identifier:of',
      'keyword:field',
      'string:"x"',
      'keyword:to',
      'keyword:the',
      'identifier:date',
    ])
  })

  it('treats down as a keyword only when followed by to', () => {
    expect(summary('repeat with i = 10 down to 1')).toEqual([
      'keyword:repeat',
      'keyword:with',
      'identifier:i',
      'operator:=',
      'number:10',
      'keyword:down',
      'keyword:to',
      'number:1',
    ])
    expect(summary('put down')).toEqual(['keyword:put', 'identifier:down'])
    expect(summary('down\tto')).toEqual(['keyword:down', 'keyword:to'])
    expect(summary('down total')).toEqual(['identifier:down', 'identifier:total'])
  })

  it('lexes && as one token, never two &', () => {
    expect(summary('a && b & c')).toEqual([
      'identifier:a',
      'operator:&&',
      'identifier:b',
      'operator:&',
      'identifier:c',
    ])
    expect(summary('a&&&b')).toEqual(['identifier:a', 'operator:&&', 'operator:&', 'identifier:b'])
  })

  it('lexes multi-character operators by longest match', () => {
    expect(summary('<> <= >= < > =')).toEqual([
      'operator:<>',
      'operator:<=',
      'operator:>=',
      'operator:<',
      'operator:>',
      'operator:=',
    ])
  })

  it('keeps a comment at the end of a statement as trivia on the newline', () => {
    const tokens = tokensOf('put 1 -- one\nput 2')
    const newline = tokens.find((t) => t.kind === 'newline')
    expect(newline).toMatchObject({ text: '\n', trivia: ' -- one', line: 1, column: 13 })
    expect(summary('put 1 -- one\nput 2')).toEqual([
      'keyword:put',
      'number:1',
      'newline:\n',
      'keyword:put',
      'number:2',
    ])
  })

  it('keeps a trailing comment without a newline as trivia on the synthetic newline', () => {
    const tokens = tokensOf('put 1 -- one')
    const last = tokens[tokens.length - 2]
    expect(last).toMatchObject({ kind: 'newline', text: '', trivia: ' -- one' })
  })

  it('counts \\r\\n as one newline and restarts the column at 1', () => {
    const tokens = tokensOf('on mouseUp\r\n  put 1\r\nend mouseUp')
    expect(tokens.filter((t) => t.kind === 'newline' && t.text !== '').map((t) => t.text)).toEqual(['\r\n', '\r\n'])
    const put = tokens.find((t) => t.text === 'put')
    expect(put).toMatchObject({ line: 2, column: 3, trivia: '  ' })
    const end = tokens.find((t) => t.text === 'end')
    expect(end).toMatchObject({ line: 3, column: 1 })
  })

  it('ends with a synthetic newline and eof', () => {
    const tokens = tokensOf('put 1')
    expect(tokens.slice(-2)).toEqual([
      { kind: 'newline', text: '', line: 1, column: 6, trivia: '' },
      { kind: 'eof', text: '', line: 1, column: 6, trivia: '' },
    ])
  })

  it('lexes the empty string as a synthetic newline and eof', () => {
    expect(tokensOf('').map((t) => t.kind)).toEqual(['newline', 'eof'])
  })

  it('does not lex "1." or ".5" as numbers', () => {
    expect(lex('1.')).toEqual({
      ok: false,
      error: { line: 1, column: 2, message: 'unexpected character "."', near: '1.' },
    })
    expect(lex('.5')).toEqual({
      ok: false,
      error: { line: 1, column: 1, message: 'unexpected character "."', near: '.5' },
    })
  })

  it('reports an unterminated string at the newline', () => {
    expect(lex('put "abc\nput 1')).toEqual({
      ok: false,
      error: { line: 1, column: 9, message: 'expected closing quote, found newline', near: 'put "abc' },
    })
  })

  it('reports an unterminated string at the end of the script', () => {
    expect(lex('put "abc')).toEqual({
      ok: false,
      error: { line: 1, column: 9, message: 'expected closing quote, found end of script', near: '' },
    })
  })

  it('reports an unknown character with its position', () => {
    expect(lex('put 1\nput ~')).toEqual({
      ok: false,
      error: { line: 2, column: 5, message: 'unexpected character "~"', near: 'put ~' },
    })
  })

  it('reports a lone carriage return as an unknown character', () => {
    expect(lex('put 1\rput 2')).toMatchObject({
      ok: false,
      error: { line: 1, column: 6, message: 'unexpected character "\r"' },
    })
  })
})

describe('properties', () => {
  // Strings built from the pieces the lexer cares about, so that the accepted
  // branch of the lossless property is exercised often, plus fully arbitrary
  // strings for the never-throws half.
  const piece = fc.oneof(
    fc.constantFrom(' ', '\t', '\n', '\r\n', '\r', '"', '--', '&&', '&', '<=', '<>', '-', '.', '~'),
    fc.constantFrom('on', 'end', 'down', 'to', 'put', 'DOWN', 'Down to', 'mouseUp', 'x_1'),
    fc.integer({ min: 0, max: 999 }).map(String),
    fc.string({ maxLength: 4 }),
  )
  const sourceArb = fc.oneof(fc.string(), fc.array(piece, { maxLength: 12 }).map((parts) => parts.join('')))

  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (source) => {
        expect(() => lex(source)).not.toThrow()
      }),
      { numRuns: 200 },
    )
  })

  it('reproduces the input from trivia plus token text for every accepted string', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const result = lex(source)
        if (!result.ok) return
        const rebuilt = result.tokens.map((t) => t.trivia + t.text).join('')
        expect(rebuilt).toBe(source)
      }),
      { numRuns: 200 },
    )
  })

  // Shrunk counter-examples found while writing the property, kept as named
  // unit tests so the regression reads without fast-check.
  it.each([
    ['a comment with no newline', 'put 1 -- one'],
    ['a comment containing a lone carriage return', '-- a\rb\nput 1'],
    ['a trailing tab', 'put 1\t'],
    ['a string containing a comment marker', '"--"'],
    ['down at end of input', 'down'],
  ])('reproduces %s', (_label, source) => {
    const result = lex(source)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.tokens.map((t) => t.trivia + t.text).join('')).toBe(source)
  })
})
