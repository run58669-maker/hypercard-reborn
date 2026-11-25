import { describe, expect, it, vi } from 'vitest'
import { EXAMPLES } from '../examples'
import { compile } from './compileService'
import { MESSAGES } from './messages'
import { descriptionHash } from './normalise'
import { createCannedProvider } from './providers/canned'
import { MissingKey, NoCannedMatch, ProviderError, type CompileContext, type CompileProvider } from './types'

const VALID = 'on openCard\n  put 1 into field "f"\nend openCard\n'

const F = { objects: [{ kind: 'field', name: 'f' }] } as const

function provider(impl: (description: string, context: CompileContext, signal: AbortSignal) => Promise<string>, model?: string) {
  const spy = vi.fn(impl)
  const p: CompileProvider = model === undefined ? { id: 'canned', compile: spy } : { id: 'anthropic', model, compile: spy }
  return { provider: p, spy }
}

describe('compile', () => {
  it('calls the provider exactly once and returns the parsed candidate with the description hash', async () => {
    const { provider: p, spy } = provider(() => Promise.resolve(VALID), 'claude-haiku-5-5')
    const result = await compile('  The  Card. ', p, F)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toBe('  The  Card. ')
    expect(spy.mock.calls[0]?.[1]).toBe(F)
    expect(spy.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({
      ok: true,
      script: VALID,
      descriptionHash: await descriptionHash('the card'),
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    })
  })

  it('omits model for a provider without one', async () => {
    const result = await compile('x', provider(() => Promise.resolve('')).provider, F)
    expect(result).toEqual({ ok: true, script: '', descriptionHash: await descriptionHash('x'), provider: 'canned' })
  })

  it('passes the caller signal through', async () => {
    const controller = new AbortController()
    const { provider: p, spy } = provider(() => Promise.resolve(''))
    await compile('x', p, F, controller.signal)
    expect(spy.mock.calls[0]?.[2]).toBe(controller.signal)
  })

  it('calls the provider exactly once even when it throws', async () => {
    const { provider: p, spy } = provider(() => Promise.reject(new Error('boom')))
    const result = await compile('x', p, F)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, error: { kind: 'unknown', message: 'Compiling failed for an unexpected reason: boom.' } })
  })

  it('returns invalid-script with the parse error and the candidate', async () => {
    const candidate = 'on openCard\n  put 1 into button "b"\nend openCard\n'
    const result = await compile('x', provider(() => Promise.resolve(candidate)).provider, F)
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid-script',
        message:
          'The compiler produced a script that does not parse (line 2, column 14: cannot put into a button; use set name of button). The previous script is still running.',
        parseError: { line: 2, column: 14, message: 'cannot put into a button; use set name of button', near: '  put 1 into button "b"' },
        candidate,
      },
    })
  })

  it.each([
    [new NoCannedMatch(), { kind: 'no-canned-match', message: MESSAGES.noCannedMatch }],
    [new MissingKey(), { kind: 'auth', message: MESSAGES.authMissing }],
    [new ProviderError('auth', '401'), { kind: 'auth', message: MESSAGES.authRejected }],
    [new ProviderError('rate-limit', '429'), { kind: 'rate-limit', message: MESSAGES.rateLimit }],
    [new ProviderError('network', 'ECONNRESET'), { kind: 'network', message: MESSAGES.network }],
    [new ProviderError('refused', 'refusal'), { kind: 'refused', message: MESSAGES.refused }],
    [new ProviderError('truncated', 'max_tokens'), { kind: 'truncated', message: MESSAGES.truncated }],
    [new ProviderError('api', 'overloaded', 529), { kind: 'api', status: 529, message: 'Anthropic returned an error (HTTP 529). Press Save to try again.' }],
    [new ProviderError('unknown', 'weird'), { kind: 'unknown', message: 'Compiling failed for an unexpected reason: weird.' }],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), { kind: 'network', message: MESSAGES.network }],
    ['a string', { kind: 'unknown', message: 'Compiling failed for an unexpected reason: a string.' }],
  ])('maps %o to %o', async (thrown, expected) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- providers may throw anything; the service must cope
    const result = await compile('x', provider(() => Promise.reject(thrown)).provider, F)
    expect(result).toEqual({ ok: false, error: expected })
  })
})

describe('compile: the object check (design.md §6.8)', () => {
  function example(id: string) {
    const found = EXAMPLES.find((e) => e.id === id)
    if (found === undefined) throw new Error(`no example ${id}`)
    return found
  }

  /** The real canned provider, with a spy on its compile. */
  function canned() {
    const real = createCannedProvider()
    const spy = vi.fn((description: string, context: CompileContext, signal: AbortSignal) => real.compile(description, context, signal))
    const p: CompileProvider = { id: 'canned', compile: spy }
    return { provider: p, spy }
  }

  it('Counter description with the Hello objects: unknown-object, field "count" missing, the §9 message, the candidate', async () => {
    const { provider: p, spy } = canned()
    const context = { objects: example('hello').objects }
    const result = await compile(example('counter').description, p, context)
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'unknown-object',
        message:
          'The compiler produced a script for objects this card does not have (field "count"). This card has: field "greeting". The previous script is still running.',
        missing: [{ kind: 'field', name: 'count' }],
        candidate: example('counter').script,
      },
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toBe(context)
  })

  it('Counter description with the Counter objects: ok', async () => {
    const { provider: p, spy } = canned()
    const result = await compile(example('counter').description, p, { objects: example('counter').objects })
    expect(result).toEqual({
      ok: true,
      script: example('counter').script,
      descriptionHash: await descriptionHash(example('counter').description),
      provider: 'canned',
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a candidate that does not parse is invalid-script, although the card has none of its objects', async () => {
    const candidate = 'on openCard\n  put 1 into field "count"\nend mouseUp\n'
    const { provider: p, spy } = provider(() => Promise.resolve(candidate))
    const result = await compile('x', p, { objects: [] })
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-script', candidate } })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('names every missing object and every object of the card, in order', async () => {
    const candidate = 'on mouseUp\n  hide button "Go"\n  put 1 into field "a"\n  put 2 into field "B"\nend mouseUp\n'
    const context = { objects: [{ kind: 'field', name: 'b' }, { kind: 'button', name: 'Stop' }] } as const
    const result = await compile('x', provider(() => Promise.resolve(candidate)).provider, context)
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'unknown-object',
        message:
          'The compiler produced a script for objects this card does not have (button "Go", field "a"). This card has: field "b", button "Stop". The previous script is still running.',
        missing: [
          { kind: 'button', name: 'Go' },
          { kind: 'field', name: 'a' },
        ],
        candidate,
      },
    })
  })

  it('a card with no objects is described as such', async () => {
    const result = await compile('x', provider(() => Promise.resolve(VALID)).provider, { objects: [] })
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'unknown-object',
        message:
          'The compiler produced a script for objects this card does not have (field "f"). This card has: no fields and no buttons. The previous script is still running.',
      },
    })
  })

  it('a script that names no object passes on a card with no objects', async () => {
    const script = 'on mouseUp\n  if the target is "Increment" then\n    put 1\n  end if\nend mouseUp\n'
    const result = await compile('x', provider(() => Promise.resolve(script)).provider, { objects: [] })
    expect(result).toMatchObject({ ok: true, script })
  })
})
