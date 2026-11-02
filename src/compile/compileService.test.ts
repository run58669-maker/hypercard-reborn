import { describe, expect, it, vi } from 'vitest'
import { compile } from './compileService'
import { MESSAGES } from './messages'
import { descriptionHash } from './normalise'
import { MissingKey, NoCannedMatch, ProviderError, type CompileProvider } from './types'

const VALID = 'on openCard\n  put 1 into field "f"\nend openCard\n'

function provider(impl: (description: string, signal: AbortSignal) => Promise<string>, model?: string) {
  const spy = vi.fn(impl)
  const p: CompileProvider = model === undefined ? { id: 'canned', compile: spy } : { id: 'anthropic', model, compile: spy }
  return { provider: p, spy }
}

describe('compile', () => {
  it('calls the provider exactly once and returns the parsed candidate with the description hash', async () => {
    const { provider: p, spy } = provider(() => Promise.resolve(VALID), 'claude-haiku-5-5')
    const result = await compile('  The  Card. ', p)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toBe('  The  Card. ')
    expect(spy.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({
      ok: true,
      script: VALID,
      descriptionHash: await descriptionHash('the card'),
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    })
  })

  it('omits model for a provider without one', async () => {
    const result = await compile('x', provider(() => Promise.resolve('')).provider)
    expect(result).toEqual({ ok: true, script: '', descriptionHash: await descriptionHash('x'), provider: 'canned' })
  })

  it('passes the caller signal through', async () => {
    const controller = new AbortController()
    const { provider: p, spy } = provider(() => Promise.resolve(''))
    await compile('x', p, controller.signal)
    expect(spy.mock.calls[0]?.[1]).toBe(controller.signal)
  })

  it('calls the provider exactly once even when it throws', async () => {
    const { provider: p, spy } = provider(() => Promise.reject(new Error('boom')))
    const result = await compile('x', p)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, error: { kind: 'unknown', message: 'Compiling failed for an unexpected reason: boom.' } })
  })

  it('returns invalid-script with the parse error and the candidate', async () => {
    const candidate = 'on openCard\n  put 1 into button "b"\nend openCard\n'
    const result = await compile('x', provider(() => Promise.resolve(candidate)).provider)
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
    const result = await compile('x', provider(() => Promise.reject(thrown)).provider)
    expect(result).toEqual({ ok: false, error: expected })
  })
})
