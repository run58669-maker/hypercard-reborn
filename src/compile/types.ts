// Compile-once pipeline types (design.md §6.1, §6.2, §6.8).
import type { ParseError } from '../parser'
import type { ObjectName } from './objectCheck'

export type ProviderId = 'anthropic' | 'canned'

/** What the service knows about the card being compiled for (design.md §6.8). */
export interface CompileContext {
  /** The fields and buttons of the card's layout. */
  readonly objects: readonly ObjectName[]
}

export interface CompileProvider {
  readonly id: ProviderId
  /** The model id, when the provider has one; reported in CompileResult. */
  readonly model?: string
  /** Returns the raw candidate script. Failure is signalled by throwing. */
  compile(description: string, context: CompileContext, signal: AbortSignal): Promise<string>
}

export type CompileResult =
  | {
      readonly ok: true
      readonly script: string
      readonly descriptionHash: string
      readonly provider: ProviderId
      readonly model?: string
    }
  | { readonly ok: false; readonly error: CompileError }

export type CompileErrorKind =
  | 'invalid-script'
  | 'unknown-object'
  | 'no-canned-match'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'refused'
  | 'truncated'
  | 'unknown'
  | 'api'

export type CompileError =
  | {
      readonly kind: 'invalid-script'
      readonly message: string
      readonly parseError: ParseError
      readonly candidate: string
    }
  | {
      readonly kind: 'unknown-object'
      readonly message: string
      readonly missing: readonly ObjectName[]
      readonly candidate: string
    }
  | {
      readonly kind: 'no-canned-match' | 'auth' | 'rate-limit' | 'network' | 'refused' | 'truncated' | 'unknown'
      readonly message: string
    }
  | { readonly kind: 'api'; readonly status: number; readonly message: string }

/** Thrown by the Anthropic provider when no key is stored. */
export class MissingKey extends Error {
  constructor() {
    super('no Anthropic key in local storage')
    this.name = 'MissingKey'
  }
}

/** Thrown by the canned provider when the description is not one of the six. */
export class NoCannedMatch extends Error {
  constructor() {
    super('description is not one of the bundled examples')
    this.name = 'NoCannedMatch'
  }
}

/**
 * Thrown by a provider for a failure it has already classified. The Anthropic
 * provider maps SDK errors to one of these so the service never has to
 * import the SDK (tech.md: the SDK is reachable from one file).
 */
export class ProviderError extends Error {
  constructor(
    readonly kind: 'auth' | 'rate-limit' | 'network' | 'refused' | 'truncated' | 'api' | 'unknown',
    detail: string,
    readonly status?: number,
  ) {
    super(detail)
    this.name = 'ProviderError'
  }
}
