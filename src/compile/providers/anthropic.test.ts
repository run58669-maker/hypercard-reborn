// Tests at the fetch boundary: the SDK is real, only `fetch` is replaced.
//
// SDK version these field names were verified against: @anthropic-ai/sdk
// 1.3.0 (messages.create, output_config.format, stop_reason; the key travels
// as an `authorization: Bearer` header). design.md §6.4 was updated in the
// same commit: `messages.parse` is replaced by `messages.create` plus the
// format helper's parse, because 1.3.0's parse throws on a truncated body
// before stop_reason can be examined.
import { describe, expect, it, vi } from 'vitest'
import { compile } from '../compileService'
import { MESSAGES } from '../messages'
import { MissingKey, ProviderError } from '../types'
import { API_KEY_STORAGE_KEY, MAX_TOKENS, MODEL, createAnthropicProvider } from './anthropic'

const SCRIPT = 'on openCard\n  put "Hello, world!" into field "greeting"\nend openCard\n'

function storage(key: string | null) {
  return { getItem: (name: string) => (name === API_KEY_STORAGE_KEY ? key : null) }
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text: JSON.stringify({ script: SCRIPT }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function apiError(status: number, type: string): Response {
  return jsonResponse({ type: 'error', error: { type, message: `${type} from test` } }, status)
}

/** A fetch mock that records requests and answers with `respond`. */
function mockFetch(respond: () => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init: init ?? {} })
    return respond()
  })
  return { fetchMock: fetchMock as unknown as typeof fetch, calls }
}

function provider(key: string | null, respond: () => Promise<Response>) {
  const { fetchMock, calls } = mockFetch(respond)
  return { provider: createAnthropicProvider({ storage: storage(key), fetch: fetchMock }), calls }
}

const signal = () => new AbortController().signal

describe('createAnthropicProvider', () => {
  it('throws MissingKey without a key and makes no request', async () => {
    const { provider: p, calls } = provider(null, () => Promise.resolve(jsonResponse(message())))
    await expect(p.compile('x', signal())).rejects.toBeInstanceOf(MissingKey)
    expect(calls).toHaveLength(0)
    const empty = provider('', () => Promise.resolve(jsonResponse(message())))
    await expect(empty.provider.compile('x', signal())).rejects.toBeInstanceOf(MissingKey)
    expect(await compile('x', p)).toEqual({ ok: false, error: { kind: 'auth', message: MESSAGES.authMissing } })
  })

  it('returns the script from a well-formed structured response with one fetch call', async () => {
    const { provider: p, calls } = provider('sk-test', () => Promise.resolve(jsonResponse(message())))
    expect(await p.compile('When the card opens, greet.', signal())).toBe(SCRIPT)
    expect(calls).toHaveLength(1)
  })

  it('sends the model id, exactly one user message, the system prompt, and no temperature or fallbacks', async () => {
    const { provider: p, calls } = provider('sk-test', () => Promise.resolve(jsonResponse(message())))
    await p.compile('Describe me.', signal())
    const call = calls[0]
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(call?.init.method).toBe('POST')
    const rawBody = call?.init.body
    if (typeof rawBody !== 'string') throw new Error('expected a string request body')
    const body = JSON.parse(rawBody) as Record<string, unknown>
    expect(body['model']).toBe(MODEL)
    expect(body['max_tokens']).toBe(MAX_TOKENS)
    expect(body['messages']).toEqual([{ role: 'user', content: 'Describe me.' }])
    expect(typeof body['system']).toBe('string')
    expect(body['system']).toContain('# Language')
    expect(body['output_config']).toMatchObject({ format: { type: 'json_schema' } })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(body).not.toHaveProperty('top_k')
    expect(body).not.toHaveProperty('fallbacks')
    expect(body).not.toHaveProperty('thinking')
    expect((body['output_config'] as Record<string, unknown>)['effort']).toBeUndefined()
    const headers = new Headers(call?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer sk-test')
  })

  it('reads the key at call time', async () => {
    let key: string | null = null
    const { fetchMock, calls } = mockFetch(() => Promise.resolve(jsonResponse(message())))
    const p = createAnthropicProvider({ storage: { getItem: () => key }, fetch: fetchMock })
    await expect(p.compile('x', signal())).rejects.toBeInstanceOf(MissingKey)
    key = 'sk-later'
    await p.compile('x', signal())
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer sk-later')
  })

  it.each([
    ['401', () => Promise.resolve(apiError(401, 'authentication_error')), 'auth', MESSAGES.authRejected],
    ['429', () => Promise.resolve(apiError(429, 'rate_limit_error')), 'rate-limit', MESSAGES.rateLimit],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed')), 'network', MESSAGES.network],
    ['stop_reason refusal', () => Promise.resolve(jsonResponse(message({ stop_reason: 'refusal', content: [] }))), 'refused', MESSAGES.refused],
    ['stop_reason max_tokens', () => Promise.resolve(jsonResponse(message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"scr' }] }))), 'truncated', MESSAGES.truncated],
    ['500', () => Promise.resolve(apiError(500, 'api_error')), 'api', 'Anthropic returned an error (HTTP 500). Press Save to try again.'],
    ['529', () => Promise.resolve(apiError(529, 'overloaded_error')), 'api', 'Anthropic returned an error (HTTP 529). Press Save to try again.'],
  ])('maps %s to %s with one fetch call', async (_label, respond, kind, expectedMessage) => {
    const { provider: p, calls } = provider('sk-test', respond)
    const result = await compile('x', p)
    expect(result).toMatchObject({ ok: false, error: { kind, message: expectedMessage } })
    expect(calls).toHaveLength(1)
  })

  it('throws a ProviderError of kind api with the status', async () => {
    const { provider: p } = provider('sk-test', () => Promise.resolve(apiError(503, 'api_error')))
    await expect(p.compile('x', signal())).rejects.toMatchObject({ kind: 'api', status: 503 })
    const result = await compile('x', p)
    expect(result).toMatchObject({ ok: false, error: { kind: 'api', status: 503 } })
  })

  it('does not retry a 429 (maxRetries 0)', async () => {
    const { provider: p, calls } = provider('sk-test', () => Promise.resolve(apiError(429, 'rate_limit_error')))
    await expect(p.compile('x', signal())).rejects.toBeInstanceOf(ProviderError)
    expect(calls).toHaveLength(1)
  })

  it('reports an aborted request as network', async () => {
    const controller = new AbortController()
    const { provider: p } = provider('sk-test', () => {
      controller.abort()
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    })
    const result = await compile('x', p, controller.signal)
    expect(result).toMatchObject({ ok: false, error: { kind: 'network', message: MESSAGES.network } })
  })

  it('hands the raw text to the service when the output is not valid structured output', async () => {
    const raw = 'on openCard\n  put 1 into button "b"\nend openCard\n'
    const { provider: p } = provider('sk-test', () => Promise.resolve(jsonResponse(message({ content: [{ type: 'text', text: raw }] }))))
    const result = await compile('x', p)
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-script', candidate: raw, parseError: { line: 2 } } })
  })

  it('returns invalid-script through the service when the structured script does not parse', async () => {
    const bad = 'on openCard\nend mouseUp\n'
    const { provider: p } = provider('sk-test', () => Promise.resolve(jsonResponse(message({ content: [{ type: 'text', text: JSON.stringify({ script: bad }) }] }))))
    const result = await compile('x', p)
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-script', candidate: bad } })
  })

  it('reports provider id and model', () => {
    const { provider: p } = provider('k', () => Promise.resolve(jsonResponse(message())))
    expect(p.id).toBe('anthropic')
    expect(p.model).toBe(MODEL)
  })
})
