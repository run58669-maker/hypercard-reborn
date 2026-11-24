// The compile service (design.md §6.1, §6.2, §6.8): exactly one provider call,
// parse the candidate, check that it names only objects the card has, return a
// validated script or a CompileError. It never writes to the store and never
// lets an exception escape.
import { parse } from '../parser'
import { MESSAGES } from './messages'
import { descriptionHash } from './normalise'
import { missingObjects } from './objectCheck'
import {
  MissingKey,
  NoCannedMatch,
  ProviderError,
  type CompileContext,
  type CompileError,
  type CompileProvider,
  type CompileResult,
} from './types'

export async function compile(
  description: string,
  provider: CompileProvider,
  context: CompileContext,
  signal?: AbortSignal,
): Promise<CompileResult> {
  let candidate: string
  try {
    // The one and only provider call. No retry loop lives here or anywhere.
    candidate = await provider.compile(description, context, signal ?? new AbortController().signal)
  } catch (error) {
    return { ok: false, error: classify(error) }
  }

  const parsed = parse(candidate)
  if (!parsed.ok) {
    return {
      ok: false,
      error: { kind: 'invalid-script', message: MESSAGES.invalidScript(parsed.error), parseError: parsed.error, candidate },
    }
  }

  // Only a script that parses is checked; a parse failure was reported above.
  const missing = missingObjects(parsed.program, context.objects)
  if (missing.length > 0) {
    return {
      ok: false,
      error: { kind: 'unknown-object', message: MESSAGES.unknownObject(missing, context.objects), missing, candidate },
    }
  }

  const hash = await descriptionHash(description)
  return provider.model === undefined
    ? { ok: true, script: candidate, descriptionHash: hash, provider: provider.id }
    : { ok: true, script: candidate, descriptionHash: hash, provider: provider.id, model: provider.model }
}

/** Maps whatever a provider threw to a CompileError with the §9 message. */
export function classify(error: unknown): CompileError {
  if (error instanceof MissingKey) return { kind: 'auth', message: MESSAGES.authMissing }
  if (error instanceof NoCannedMatch) return { kind: 'no-canned-match', message: MESSAGES.noCannedMatch }
  if (error instanceof ProviderError) {
    switch (error.kind) {
      case 'auth':
        return { kind: 'auth', message: MESSAGES.authRejected }
      case 'rate-limit':
        return { kind: 'rate-limit', message: MESSAGES.rateLimit }
      case 'network':
        return { kind: 'network', message: MESSAGES.network }
      case 'refused':
        return { kind: 'refused', message: MESSAGES.refused }
      case 'truncated':
        return { kind: 'truncated', message: MESSAGES.truncated }
      case 'api':
        return { kind: 'api', status: error.status ?? 0, message: MESSAGES.api(error.status ?? 0) }
      case 'unknown':
        return { kind: 'unknown', message: MESSAGES.unknown(error.message) }
    }
  }
  if (error instanceof Error && error.name === 'AbortError') return { kind: 'network', message: MESSAGES.network }
  const detail = error instanceof Error ? error.message : String(error)
  return { kind: 'unknown', message: MESSAGES.unknown(detail) }
}
