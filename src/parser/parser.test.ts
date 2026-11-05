import { describe, expect, it } from 'vitest'
import countdownScript from '../../.kiro/specs/flip-card/examples/countdown.hc/script.hc?raw'
import counterScript from '../../.kiro/specs/flip-card/examples/counter.hc/script.hc?raw'
import dateStampScript from '../../.kiro/specs/flip-card/examples/date-stamp.hc/script.hc?raw'
import greeterScript from '../../.kiro/specs/flip-card/examples/greeter.hc/script.hc?raw'
import helloScript from '../../.kiro/specs/flip-card/examples/hello.hc/script.hc?raw'
import quizScript from '../../.kiro/specs/flip-card/examples/quiz.hc/script.hc?raw'

const EXAMPLE_SCRIPTS: Record<string, string> = {
  hello: helloScript,
  counter: counterScript,
  'date-stamp': dateStampScript,
  greeter: greeterScript,
  countdown: countdownScript,
  quiz: quizScript,
}
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

describe('if and repeat', () => {
  it.each(Object.keys(EXAMPLE_SCRIPTS))('parses the %s example', (id) => {
    const source = EXAMPLE_SCRIPTS[id] as string
    const result = parse(source)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.program.source).toBe(source)
  })

  it('parses the block form with else', () => {
    const p = program('on mouseUp\n  if x then\n    put 1\n  else\n    put 2\n    put 3\n  end if\nend mouseUp\n')
    expect(p.handlers[0]?.body[0]).toMatchObject({
      kind: 'if',
      form: 'block',
      condition: { kind: 'variable', name: 'x' },
      then: [{ kind: 'put' }],
      else: [{ kind: 'put' }, { kind: 'put' }],
    })
  })

  it('parses the block form without else', () => {
    const p = program('on mouseUp\n  if x then\n  end if\nend mouseUp\n')
    expect(p.handlers[0]?.body[0]).toMatchObject({ kind: 'if', form: 'block', then: [], else: null })
  })

  it('parses the single-line form with and without else on the next line', () => {
    const p = program('on mouseUp\n  if x then put 1\n  else put 2\n  if y then put 3\n  put 4\nend mouseUp\n')
    expect(p.handlers[0]?.body).toMatchObject([
      { kind: 'if', form: 'single', then: [{ kind: 'put', value: { text: '1' } }], else: [{ kind: 'put', value: { text: '2' } }] },
      { kind: 'if', form: 'single', then: [{ kind: 'put', value: { text: '3' } }], else: null },
      { kind: 'put', value: { text: '4' } },
    ])
  })

  it('gives a next-line else to the single-line if, not to the enclosing block if', () => {
    const p = program('on mouseUp\n  if a then\n    if b then put 1\n    else put 2\n  end if\nend mouseUp\n')
    expect(p.handlers[0]?.body[0]).toMatchObject({
      kind: 'if',
      form: 'block',
      then: [{ kind: 'if', form: 'single', else: [{ kind: 'put' }] }],
      else: null,
    })
  })

  it('tells the forms apart by what follows then, including a comment', () => {
    const p = program('on mouseUp\n  if x then -- block\n    put 1\n  end if\nend mouseUp\n')
    expect(p.handlers[0]?.body[0]).toMatchObject({ kind: 'if', form: 'block' })
  })

  it.each([
    ['if x then if y then put 1', { line: 2, column: 13, message: 'a single-line if cannot contain "if" or "repeat"' }],
    ['if x then repeat forever\n  end repeat', { line: 2, column: 13, message: 'a single-line if cannot contain "if" or "repeat"' }],
    ['if x then put 1\n  else if y then put 2', { line: 3, column: 8, message: 'a single-line if cannot contain "if" or "repeat"' }],
    ['if x\n  end if', { line: 2, column: 7, message: 'expected "then", found newline' }],
    ['if x then\n    put 1', { line: 4, column: 5, message: 'expected "end if", found "end mouseUp"' }],
    ['if x then\n  end repeat', { line: 3, column: 7, message: 'expected "end if", found "end repeat"' }],
    ['repeat forever\n  end if', { line: 3, column: 7, message: 'expected "end repeat", found "end if"' }],
    ['if x then\n  end', { line: 3, column: 6, message: 'expected "end if", found newline' }],
    ['repeat with end = 1 to 2\n  end repeat', { line: 2, column: 15, message: 'expected a variable name, found "end"' }],
    ['repeat with i 1 to 2\n  end repeat', { line: 2, column: 17, message: 'expected "=", found "1"' }],
    ['repeat with i = 1 2\n  end repeat', { line: 2, column: 21, message: 'expected "to" or "down to", found "2"' }],
    ['repeat 3\n  end repeat', { line: 2, column: 11, message: 'expected "times", found newline' }],
    ['repeat\n  end repeat', { line: 2, column: 9, message: 'expected an expression, found newline' }],
  ])('reports %j', (source, expected) => {
    expect(error(`on mouseUp\n  ${source}\nend mouseUp\n`)).toMatchObject(expected)
  })

  it.each([
    ['repeat 3 times', { kind: 'times', count: { kind: 'number', text: '3' } }],
    ['repeat with i = 1 to 3', { kind: 'with', variable: 'i', direction: 'up', from: { text: '1' }, to: { text: '3' } }],
    ['repeat with i = 3 down to 1', { kind: 'with', variable: 'i', direction: 'down', from: { text: '3' }, to: { text: '1' } }],
    ['repeat while x', { kind: 'while', condition: { kind: 'variable', name: 'x' } }],
    ['repeat forever', { kind: 'forever' }],
  ])('parses the head of %j', (head, expected) => {
    const p = program(`on mouseUp\n  ${head}\n    put 1\n  end repeat\nend mouseUp\n`)
    expect(p.handlers[0]?.body[0]).toMatchObject({ kind: 'repeat', head: expected, body: [{ kind: 'put' }] })
  })

  it('produces distinct heads for to and down to', () => {
    const up = program('on mouseUp\n  repeat with i = 1 to 3\n  end repeat\nend mouseUp\n')
    const down = program('on mouseUp\n  repeat with i = 1 down to 3\n  end repeat\nend mouseUp\n')
    const upHead = (up.handlers[0]?.body[0] as { head: unknown }).head
    const downHead = (down.handlers[0]?.body[0] as { head: unknown }).head
    expect(upHead).not.toEqual(downHead)
    expect(upHead).toMatchObject({ direction: 'up' })
    expect(downHead).toMatchObject({ direction: 'down' })
  })
})
