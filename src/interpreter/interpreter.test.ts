import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import type { Program } from '../parser'
import { FakeHost } from './fakeHost'
import { run, STATEMENT_BUDGET } from './interpreter'

const NOW = new Date(2026, 10, 1, 15, 4)

function program(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`${result.error.message} (line ${result.error.line})`)
  return result.program
}

function host(): FakeHost {
  return new FakeHost(
    [
      { kind: 'field', name: 'count', visible: true, text: '0' },
      { kind: 'field', name: 'list', visible: true },
      { kind: 'button', name: 'Go', visible: true },
    ],
    NOW,
  )
}

/** Runs `body` inside `on mouseUp` with target "Go". */
function mouseUp(body: string, h: FakeHost = host()) {
  return { result: run(program(`on mouseUp\n${body}\nend mouseUp\n`), 'mouseUp', h, { target: 'Go' }), host: h }
}

describe('run', () => {
  it('returns ok with zero statements when the handler is missing', () => {
    const h = host()
    expect(run(program('on mouseUp\n  put 1\nend mouseUp\n'), 'openCard', h, { target: '' })).toEqual({ ok: true, statements: 0 })
    expect(run(program(''), 'mouseUp', h, { target: '' })).toEqual({ ok: true, statements: 0 })
    expect(h.calls).toEqual([])
  })

  it('counts statements', () => {
    expect(mouseUp('  put 1 into x\n  put 2 into y').result).toEqual({ ok: true, statements: 2 })
  })

  it('puts into a variable, a field and the message box', () => {
    const { result, host: h } = mouseUp('  put 5 into Total\n  put total + 1 into field "count"\n  put "hi"')
    expect(result).toEqual({ ok: true, statements: 3 })
    expect(h.object('field', 'count')?.text).toBe('6')
    expect(h.messages).toEqual(['hi'])
  })

  it('get stores into it', () => {
    const { host: h } = mouseUp('  get 2 * 3\n  put it into field "count"\n  put IT & "!" into field "list"')
    expect(h.object('field', 'count')?.text).toBe('6')
    expect(h.object('field', 'list')?.text).toBe('6!')
  })

  it('answers, navigates, shows and hides', () => {
    const { result, host: h } = mouseUp('  answer "Correct!"\n  go to card 2\n  hide field "count"\n  show button "go"\n  set visible of field "list" to false\n  set enabled of button "Go" to false\n  set name of button "Go" to "Stop"')
    expect(result.ok).toBe(true)
    expect(h.dialogs).toEqual(['Correct!'])
    expect(h.navigations).toEqual([2])
    expect(h.object('field', 'count')?.visible).toBe(false)
    expect(h.object('field', 'list')?.visible).toBe(false)
    expect(h.object('button', 'Stop')).toMatchObject({ visible: true, enabled: false, name: 'Stop' })
  })

  it('runs both if forms', () => {
    const { host: h } = mouseUp(
      [
        '  if 1 < 2 then put "a" into field "list"',
        '  if 1 > 2 then put "b" into field "list"',
        '  else put field "list" & "c" into field "list"',
        '  if the target is "Go" then',
        '    put field "list" & "d" into field "list"',
        '  else',
        '    put "x" into field "list"',
        '  end if',
        '  if false then',
        '    put "y" into field "list"',
        '  end if',
      ].join('\n'),
    )
    expect(h.object('field', 'list')?.text).toBe('acd')
  })

  it.each([
    ['repeat 3 times\n    put field "list" & "x" into field "list"\n  end repeat', 'xxx'],
    ['repeat 2.9 times\n    put field "list" & "x" into field "list"\n  end repeat', 'xx'],
    ['repeat 0 times\n    put "never" into field "list"\n  end repeat', ''],
    ['repeat -1 times\n    put "never" into field "list"\n  end repeat', ''],
    ['repeat with i = 1 to 3\n    put field "list" & i into field "list"\n  end repeat', '123'],
    ['repeat with i = 3 down to 1\n    put field "list" & i into field "list"\n  end repeat', '321'],
    ['repeat with i = 3 to 1\n    put "never" into field "list"\n  end repeat', ''],
    ['repeat with i = 1 down to 3\n    put "never" into field "list"\n  end repeat', ''],
    ['repeat with i = 1 to 3\n    put 99 into i\n    put field "list" & i into field "list"\n  end repeat', '999999'],
    ['repeat with i = 1 to 3\n  end repeat\n  put i into field "list"', '3'],
    ['repeat with i = 5 to 1\n  end repeat\n  put i into field "list"', 'i'],
    ['repeat with i = 0.5 to 2\n    put field "list" & i & " " into field "list"\n  end repeat', '0.5 1.5 '],
    ['put 0 into n\n  repeat while n < 3\n    put n + 1 into n\n  end repeat\n  put n into field "list"', '3'],
    ['repeat while false\n    put "never" into field "list"\n  end repeat', ''],
  ])('%s', (body, expected) => {
    const { result, host: h } = mouseUp(`  ${body}`)
    expect(result.ok).toBe(true)
    expect(h.object('field', 'list')?.text).toBe(expected)
  })

  it('evaluates the repeat with bounds once, before the first iteration', () => {
    const { host: h } = mouseUp('  put 2 into n\n  repeat with i = 1 to n\n    put 10 into n\n    put field "list" & i into field "list"\n  end repeat')
    expect(h.object('field', 'list')?.text).toBe('12')
  })

  describe('runtime error messages (design.md §5.4)', () => {
    it.each([
      ['put field "x" into y', 'field "x" does not exist', 2, 7],
      ['put button "x" into y', 'button "x" does not exist', 2, 7],
      ['put 1 into field "x"', 'field "x" does not exist', 2, 14],
      ['show field "x"', 'field "x" does not exist', 2, 8],
      ['hide button "x"', 'button "x" does not exist', 2, 8],
      ['set visible of button "x" to true', 'button "x" does not exist', 2, 18],
      ['put "abc" + 1 into y', 'expected a number, found "abc"', 2, 7],
      ['put 1 / 0 into y', 'division by zero', 2, 7],
      ['put 1 div 0 into y', 'division by zero', 2, 7],
      ['put 1 mod 0 into y', 'division by zero', 2, 7],
      ['put "x" and true into y', 'expected true or false, found "x"', 2, 7],
      ['put not "x" into y', 'expected true or false, found "x"', 2, 7],
      ['set visible of field "count" to "x"', 'expected true or false, found "x"', 2, 3],
      ['set enabled of button "Go" to "x"', 'expected true or false, found "x"', 2, 3],
      ['repeat while "x"\n  end repeat', 'expected true or false, found "x"', 2, 3],
      ['if "x" then put 1', 'expected true or false, found "x"', 2, 3],
      ['set enabled of field "count" to true', 'field "count" has no enabled property', 2, 18],
      ['go to card 7', 'card 7 does not exist', 2, 3],
      ['go to card 0', 'card 0 does not exist', 2, 3],
      ['go to card 7.9', 'card 7 does not exist', 2, 3],
      ['go to card "abc"', 'expected a number, found "abc"', 2, 3],
      ['repeat "x" times\n  end repeat', 'expected a number, found "x"', 2, 3],
      ['repeat with i = "a" to 2\n  end repeat', 'expected a number, found "a"', 2, 3],
    ])('%s -> %s', (body, message, line, column) => {
      const { result } = mouseUp(`  ${body}`)
      expect(result).toMatchObject({ ok: false, error: { message, line, column, handler: 'mouseUp' } })
    })

    it('reports a non-finite result as out of range', () => {
      const { result } = mouseUp(`  put ${'9'.repeat(200)} into x\n  put x * x into y`)
      expect(result).toMatchObject({ ok: false, error: { message: 'number out of range', line: 3, column: 7 } })
    })

    it('reports a value over 64 KiB', () => {
      const { result } = mouseUp('  put "x" into s\n  repeat 17 times\n    put s & s into s\n  end repeat')
      expect(result).toMatchObject({ ok: false, error: { message: 'value too long', line: 4, column: 9 } })
    })
  })

  it('stops an empty repeat forever with script ran too long after exactly 10,000 statements', () => {
    const { result } = mouseUp('  repeat forever\n  end repeat')
    expect(result).toEqual({
      ok: false,
      statements: STATEMENT_BUDGET,
      error: { message: 'script ran too long', line: 2, column: 3, handler: 'mouseUp' },
    })
  })

  it('charges every statement, including those inside loops', () => {
    const { result, host: h } = mouseUp('  repeat forever\n    put field "count" + 1 into field "count"\n  end repeat')
    expect(result).toMatchObject({ ok: false, statements: STATEMENT_BUDGET, error: { message: 'script ran too long' } })
    // 10,000 charges: 5,000 for the repeat head and 5,000 for the body.
    expect(h.object('field', 'count')?.text).toBe('5000')
  })

  it('keeps side effects performed before the failing statement', () => {
    const { result, host: h } = mouseUp('  put "done" into field "list"\n  put field "nope" into x\n  put "never" into field "list"')
    expect(result.ok).toBe(false)
    expect(h.object('field', 'list')?.text).toBe('done')
  })

  it('reports the handler name in the error', () => {
    const result = run(program('on openCard\n  go to card 9\nend openCard\n'), 'openCard', host(), { target: '' })
    expect(result).toMatchObject({ ok: false, error: { handler: 'openCard', message: 'card 9 does not exist' } })
  })

  it('gives each run its own variables', () => {
    const p = program('on mouseUp\n  put x & "!" into field "list"\n  put "set" into x\nend mouseUp\n')
    const h = host()
    run(p, 'mouseUp', h, { target: 'Go' })
    run(p, 'mouseUp', h, { target: 'Go' })
    expect(h.object('field', 'list')?.text).toBe('x!')
  })
})
