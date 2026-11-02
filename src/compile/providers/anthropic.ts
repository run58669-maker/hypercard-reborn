// The Anthropic compile provider, BYOK (design.md §6.4). This is the only
// file in the project that imports @anthropic-ai/sdk (tech.md).
//
// SDK field names verified against @anthropic-ai/sdk 1.3.0: `messages.parse`,
// `output_config.format` with `zodOutputFormat`, `parsed_output`, and
// `stop_reason` values `refusal` / `max_tokens`.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { SYSTEM_PROMPT } from '../prompt'
import { MissingKey, ProviderError, type CompileProvider } from '../types'

export const API_KEY_STORAGE_KEY = 'hcr.anthropicApiKey'
export const MODEL = 'claude-haiku-5-5'
export const MAX_TOKENS = 2048
export const TIMEOUT_MS = 30_000

const OUTPUT = z.object({ script: z.string() })

/** The subset of Web Storage the provider reads; the app passes localStorage. */
export interface KeyStorage {
  getItem(key: string): string | null
}

export interface AnthropicProviderOptions {
  /** Where the key lives; read at call time, never cached. Defaults to localStorage. */
  readonly storage?: KeyStorage
  /** Injected transport for tests at the fetch boundary. Defaults to the global fetch. */
  readonly fetch?: typeof fetch
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): CompileProvider {
  return {
    id: 'anthropic',
    model: MODEL,
    async compile(description: string, signal: AbortSignal): Promise<string> {
      const storage = options.storage ?? globalThis.localStorage
      const apiKey = storage.getItem(API_KEY_STORAGE_KEY)
      if (apiKey === null || apiKey === '') throw new MissingKey()

      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 0,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      })

      let message
      try {
        message = await client.messages.parse(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: description }],
            output_config: { format: zodOutputFormat(OUTPUT) },
          },
          { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) },
        )
      } catch (error) {
        throw classify(error)
      }

      // Branch on stop_reason before reading content (tech.md).
      if (message.stop_reason === 'refusal') throw new ProviderError('refused', 'stop_reason refusal')
      if (message.stop_reason === 'max_tokens') throw new ProviderError('truncated', 'stop_reason max_tokens')
      if (message.parsed_output === null) {
        // Not valid structured output: hand the raw text to the service, whose
        // parse of it produces the invalid-script error with this candidate.
        return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      }
      return message.parsed_output.script
    },
  }
}

/** Maps SDK errors most-specific first (design.md §6.4); anything else passes through. */
function classify(error: unknown): unknown {
  if (error instanceof Anthropic.AuthenticationError) return new ProviderError('auth', error.message, 401)
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('rate-limit', error.message, 429)
  if (error instanceof Anthropic.APIUserAbortError) return new ProviderError('network', error.message)
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('network', error.message)
  if (error instanceof Anthropic.APIError) return new ProviderError('api', error.message, typeof error.status === 'number' ? error.status : 0)
  return error
}
