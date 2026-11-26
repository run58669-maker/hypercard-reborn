// Requirement 7.9 and grammar §7: one run does a bounded amount of expression
// work, and no expression yields a value over 64 KiB, wherever it is used.
import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { WORK_BUDGET, WORK_UNIT_LENGTH } from './evaluate'
import { FakeHost } from './fakeHost'
import { run } from './interpreter'
import { MAX_VALUE_LENGTH } from './values'

const NOW = new Date(2026, 10, 1, 15, 4)

function host(fieldText = ''): FakeHost {
  return new FakeHost(
    [
      { kind: 'field', name: 'out', visible: true, text: fieldText },
      { kind: 'button', name: 'Go', visible: true },
    ],
    NOW,
  )
}

function openCard(body: string, h: FakeHost = host()) {
  const parsed = parse(`on openCard\n${body}\nend openCard\n`)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { result: run(parsed.program, 'openCard', h, { target: '' }), host: h }
}

/** A balanced expression of 2^depth ones: `((1 + 1) + (1 + 1))`. */
function balanced(depth: number): string {
  return depth === 0 ? '1' : `(${balanced(depth - 1)} + ${balanced(depth - 1)})`
}

describe('the work budget of a run', () => {
  it('exports the numbers of requirement 7.9', () => {
    expect(WORK_BUDGET).toBe(1_000_000)
    expect(WORK_UNIT_LENGTH).toBe(256)
  })

  it('stops a loop around a large expression with script ran too long, long before the statement budget', () => {
    // 2^12 leaves: 8,191 nodes per evaluation, 9,999 iterations asked for.
    const started = performance.now()
    const { result, host: h } = openCard(`  repeat 9999 times\n    put ${balanced(12)} into field "out"\n  end repeat`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('script ran too long')
    expect(result.error.line).toBe(3)
    // About 122 evaluations fit in the budget; each iteration is two statements.
    expect(result.statements).toBeGreaterThan(200)
    expect(result.statements).toBeLessThan(300)
    expect(h.object('field', 'out')?.text).toBe('4096')
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it('runs an expression of 8,191 nodes once', () => {
    const { result, host: h } = openCard(`  put ${balanced(12)} into field "out"`)
    expect(result).toEqual({ ok: true, statements: 1 })
    expect(h.object('field', 'out')?.text).toBe('4096')
  })

  it('charges long values: copying 64 KiB around 10,000 times does not fit', () => {
    const big = 'x'.repeat(MAX_VALUE_LENGTH)
    const { result } = openCard('  repeat 9999 times\n    get field "out"\n  end repeat', host(big))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('script ran too long')
    // Each read costs 1 + 65,536 / 256 = 257 units: 3,891 reads fit.
    expect(result.statements).toBeGreaterThan(7000)
    expect(result.statements).toBeLessThan(8000)
  })

  it('starts the count again on the next run', () => {
    const parsed = parse(`on openCard\n  repeat 100 times\n    put ${balanced(12)} into field "out"\n  end repeat\nend openCard\n`)
    if (!parsed.ok) throw new Error(parsed.error.message)
    const h = host()
    for (let i = 0; i < 3; i += 1) expect(run(parsed.program, 'openCard', h, { target: '' }).ok).toBe(true)
  })

  it('leaves the bundled kind of script far from the budget: 10,000 cheap statements still end on the statement budget', () => {
    const { result } = openCard('  put 0 into n\n  repeat forever\n    put n + 1 into n\n  end repeat')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.statements).toBe(10_000)
    expect(result.error.message).toBe('script ran too long')
  })
})

describe('the 64 KiB limit holds for every value an expression yields', () => {
  const over = 'x'.repeat(MAX_VALUE_LENGTH + 1)
  const exact = 'x'.repeat(MAX_VALUE_LENGTH)

  it.each([
    ['answer with a literal', `  answer "${over}"`],
    ['get with a literal', `  get "${over}"`],
    ['set name with a literal', `  set name of button "Go" to "${over}"`],
    ['a comparison of a literal', `  if "${over}" is "a" then put 1 into field "out"`],
  ])('%s over the limit is value too long, and nothing reaches the host', (_name, body) => {
    const { result, host: h } = openCard(body)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('value too long')
    expect(result.error.line).toBe(2)
    expect(h.dialogs).toEqual([])
    expect(h.object('button', 'Go')?.name).toBe('Go')
    expect(h.object('field', 'out')?.text).toBe('')
  })

  it('reading a field that holds more than the limit is value too long', () => {
    const { result, host: h } = openCard('  answer field "out"', host(over))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('value too long')
    expect(h.dialogs).toEqual([])
  })

  it('a value of exactly the limit passes through answer, get and a field read', () => {
    const { result, host: h } = openCard(`  answer "${exact}"\n  get field "out"\n  answer it`, host(exact))
    expect(result.ok).toBe(true)
    expect(h.dialogs.map((d) => d.length)).toEqual([MAX_VALUE_LENGTH, MAX_VALUE_LENGTH])
  })
})
