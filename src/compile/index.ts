// Public surface of the compile module (design.md §2). The UI loads this
// module only through a dynamic import() so the SDK stays out of the runtime
// chunk; the interpreter, runtime and store cannot import it at all.
export { compile } from './compileService'
export { normalise, descriptionHash } from './normalise'
export { MESSAGES } from './messages'
export { MissingKey, NoCannedMatch, ProviderError } from './types'
export type { CompileError, CompileErrorKind, CompileProvider, CompileResult, ProviderId } from './types'
