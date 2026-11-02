import { describe, expect, it } from 'vitest'
import helloScript from '../../.kiro/specs/flip-card/examples/hello.hc/script.hc?raw'
import { parse } from './parser'

function program(source: string) {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${result.error.line})`)
  return result.program
}

function error(source: string) {
  const result = parse(source)
  if (result.ok) throw new Error('expected a parse error')
  return result.error
}

describe('parse', () => {
  it('returns the source by reference', () => {
    const source = 'on mouseUp\n  put 1\nend mouseUp\n'
    expect(program(source).source).toBe(source)
  })

  it('parses the empty script as zero handlers', () => {
    expect(program('').handlers).toEqual([])
    expect(program('\n\n-- just a comment\n').handlers).toEqual([])
  })

  it('parses the hello example', () => {
    const p = program(helloScript)
    expect(p.handlers).toHaveLength(1)
    expect(p.handlers[0]).toMatchObject({
      kind: 'handler',
      name: 'openCard',
      line: 1,
      column: 1,
      body: [
        {
          kind: 'put',
          line: 2,
          column: 3,
          value: { kind: 'string', value: 'Hello, world!' },
          into: { kind: 'objectRef', objectKind: 'field', name: 'greeting' },
        },
      ],
    })
  })

  it('parses handler names case-insensitively into their canonical form', () => {
    const p = program('ON MOUSEUP\nEND mouseup\n\non OpenCard\nend opencard')
    expect(p.handlers.map((h) => h.name)).toEqual(['mouseUp', 'openCard'])
  })

  it('allows blank and comment lines inside and between handlers', () => {
    const p = program('-- top\n\non mouseUp\n\n  -- inside\n  put 1 -- trailing\n\nend mouseUp\n\n')
    expect(p.handlers[0]?.body).toHaveLength(1)
  })

  it('parses without a trailing newline', () => {
    expect(program('on mouseUp\nend mouseUp').handlers).toHaveLength(1)
  })

  it.each([
    ['put 1', { kind: 'put', value: { kind: 'number', text: '1' }, into: null }],
    ['put "a" into x', { kind: 'put', into: { kind: 'variable', name: 'x' } }],
    ['put Total into total', { kind: 'put', value: { kind: 'variable', name: 'Total' }, into: { kind: 'variable', name: 'total' } }],
    ['put empty into field "f"', { kind: 'put', value: { kind: 'constant', name: 'empty' }, into: { kind: 'objectRef', objectKind: 'field', name: 'f' } }],
    ['set visible of field "f" to true', { kind: 'set', property: 'visible', object: { objectKind: 'field', name: 'f' }, value: { kind: 'constant', name: 'true' } }],
    ['set Enabled of button "b" to false', { kind: 'set', property: 'enabled', object: { objectKind: 'button', name: 'b' } }],
    ['set name of button "b" to "c"', { kind: 'set', property: 'name', value: { kind: 'string', value: 'c' } }],
    ['get the date', { kind: 'get', value: { kind: 'builtin', name: 'date' } }],
    ['get the Time', { kind: 'get', value: { kind: 'builtin', name: 'time' } }],
    ['answer the target', { kind: 'answer', value: { kind: 'builtin', name: 'target' } }],
    ['go to card 2', { kind: 'go', card: { kind: 'number', text: '2' } }],
    ['go card 2', { kind: 'go', card: { kind: 'number', text: '2' } }],
    ['show field "f"', { kind: 'show', object: { objectKind: 'field', name: 'f' } }],
    ['hide button "b"', { kind: 'hide', object: { objectKind: 'button', name: 'b' } }],
    ['put (1)', { kind: 'put', value: { kind: 'number', text: '1' } }],
  ])('parses the statement %j', (statement, expected) => {
    const p = program(`on mouseUp\n  ${statement}\nend mouseUp\n`)
    expect(p.handlers[0]?.body[0]).toMatchObject(expected)
  })

  it.each([
    ['put x into button "b"', { line: 2, column: 14, message: 'cannot put into a button; use set name of button', near: '  put x into button "b"' }],
    ['on mouseUp\nend mouseUp\non mouseUp\nend mouseUp', { line: 3, column: 1, message: 'duplicate handler "mouseUp"', near: 'on mouseUp' }],
    ['on mouseUp\nend openCard', { line: 2, column: 5, message: 'expected "end mouseUp", found "end openCard"', near: 'end openCard' }],
    ['on mouseUp\nend foo', { line: 2, column: 5, message: 'expected "end mouseUp", found "end foo"', near: 'end foo' }],
    ['on mouseUp\nend', { line: 2, column: 4, message: 'expected "end mouseUp", found newline', near: 'end' }],
    ['on mouseUp', { line: 1, column: 11, message: 'expected "end mouseUp", found end of script', near: '' }],
    ['on foo\nend foo', { line: 1, column: 4, message: 'expected "mouseUp" or "openCard", found "foo"', near: 'on foo' }],
    ['put 1', { line: 1, column: 1, message: 'expected "on", found "put"', near: 'put 1' }],
    ['put 1 into end', { line: 2, column: 14, message: 'expected a variable name, found "end"', near: '  put 1 into end' }],
    ['put 1 into down', { line: 2, column: 14, message: 'expected a variable name, found "down"', near: '  put 1 into down' }],
    ['put 1 into 5', { line: 2, column: 14, message: 'expected a variable name, found "5"', near: '  put 1 into 5' }],
    ['set x of field "f" to 1', { line: 2, column: 7, message: 'expected "visible", "enabled" or "name", found "x"', near: '  set x of field "f" to 1' }],
    ['set name of x to 1', { line: 2, column: 15, message: 'expected "field" or "button", found "x"', near: '  set name of x to 1' }],
    ['set name of field f to 1', { line: 2, column: 21, message: 'expected a string, found "f"', near: '  set name of field f to 1' }],
    ['set name of field "f" 1', { line: 2, column: 25, message: 'expected "to", found "1"', near: '  set name of field "f" 1' }],
    ['go 2', { line: 2, column: 6, message: 'expected "card", found "2"', near: '  go 2' }],
    ['put 1 2', { line: 2, column: 9, message: 'expected newline, found "2"', near: '  put 1 2' }],
    ['frobnicate', { line: 2, column: 3, message: 'expected a statement, found "frobnicate"', near: '  frobnicate' }],
    ['else', { line: 2, column: 3, message: 'expected a statement, found "else"', near: '  else' }],
    ['put end', { line: 2, column: 7, message: 'expected an expression, found "end"', near: '  put end' }],
    ['put down', { line: 2, column: 7, message: 'expected an expression, found "down"', near: '  put down' }],
    ['put the foo', { line: 2, column: 11, message: 'expected "date", "time" or "target", found "foo"', near: '  put the foo' }],
    ['put "a" into', { line: 2, column: 15, message: 'expected a variable name, found newline', near: '  put "a" into' }],
    ['put (1', { line: 2, column: 9, message: 'expected ")", found newline', near: '  put (1' }],
  ])('reports %j', (source, expected) => {
    const wrapped = source.startsWith('on ') || source === 'put 1' ? source : `on mouseUp\n  ${source}\nend mouseUp\n`
    expect(error(wrapped)).toEqual(expected)
  })
})
