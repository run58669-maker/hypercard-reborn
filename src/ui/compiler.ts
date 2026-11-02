// The UI's handle on the compile service (design.md §6.1, §10). The compile
// module is loaded with a dynamic import() the first time it is needed, so
// the Anthropic SDK is not part of the runtime chunk and is not loaded until
// the author presses Save (or views a card compiled in this browser, whose
// stale-description notice needs the description hash).
import type { CompileResult } from '../compile'
import type { StorageLike } from '../store'
import type { ProviderChoice } from './settings'

export interface Compiler {
  compile(description: string, provider: ProviderChoice, signal: AbortSignal): Promise<CompileResult>
  descriptionHash(description: string): Promise<string>
}

export type LoadCompiler = () => Promise<Compiler>

/** Loads src/compile lazily, once, and binds the Anthropic provider to `storage` for its key. */
export function lazyCompiler(storage: StorageLike): LoadCompiler {
  let loaded: Promise<Compiler> | null = null
  return () => {
    loaded ??= import('../compile').then((mod) => ({
      compile: (description, provider, signal) =>
        mod.compile(description, provider === 'anthropic' ? mod.createAnthropicProvider({ storage }) : mod.createCannedProvider(), signal),
      descriptionHash: mod.descriptionHash,
    }))
    return loaded
  }
}
