// Public surface of the compile module (design.md §2). The UI loads this
// module only through a dynamic import() so the SDK stays out of the runtime
// chunk; the interpreter, runtime and store cannot import it at all.
export { compile } from './compileService'
export { createCannedProvider } from './providers/canned'
export { createAnthropicProvider, API_KEY_STORAGE_KEY, MODEL } from './providers/anthropic'
export { normalise, descriptionHash } from './normalise'
export { MESSAGES, objectsLine } from './messages'
export { MissingKey, NoCannedMatch, ProviderError } from './types'
export type { CompileContext, CompileError, CompileErrorKind, CompileProvider, CompileResult, ProviderId } from './types'
export { missingObjects, referencedObjects } from './objectCheck'
export type { ObjectName } from './objectCheck'
