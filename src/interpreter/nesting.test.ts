import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import type { Program } from '../parser'
import type { DeepScript } from '../parser/deepScripts'
import { deepScripts, ifs, intoField, parentheses } from '../parser/deepScripts'
import { FakeHost } from './fakeHost'
import { run } from './interpreter'

// Requirement 7.5 (task 18.1): a script that parses can be run, however its 64
// levels are spent. The scripts come from src/parser/deepScripts.ts. Task 19.3:
// each test asserts the whole result of the run, and what the run wrote.

const NOW = new Date(2026, 10, 1, 15, 4)

function parsed(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${String(result.error.line)})`)
  return result.program
}

describe('run at the nesting limit', () => {
  const field = (): FakeHost => new FakeHost([{ kind: 'field', name: 'x', visible: true }], NOW)

  it.each(deepScripts(64).map((script): [string, DeepScript] => [script.label, script]))(
    'runs %s to its value, with the statement count of the script',
    (_label, script) => {
      const host = field()
      expect(run(parsed(intoField(script)), 'mouseUp', host, { target: '' })).toEqual({ ok: true, statements: script.statements })
      expect(host.object('field', 'x')?.text).toBe(script.value)
    },
  )

  it('reports a runtime error at the bottom of 64 parentheses with its message, line and column', () => {
    const source = intoField(parentheses(64)).replace('(1)', '(field "gone")')
    const host = field()
    expect(run(parsed(source), 'mouseUp', host, { target: '' })).toEqual({
      ok: false,
      statements: 1,
      error: { message: 'field "gone" does not exist', line: 2, column: 6 + 64 + 1, handler: 'mouseUp' },
    })
    expect(host.object('field', 'x')?.text).toBe('')
  })

  it('reports a runtime error at the bottom of 64 nested if with its message, line and column', () => {
    const source = intoField(ifs(64)).replace('put 1 into', 'put field "gone" into')
    const host = field()
    expect(run(parsed(source), 'mouseUp', host, { target: '' })).toEqual({
      ok: false,
      statements: 65,
      error: { message: 'field "gone" does not exist', line: 66, column: 5, handler: 'mouseUp' },
    })
    expect(host.object('field', 'x')?.text).toBe('')
  })
})
