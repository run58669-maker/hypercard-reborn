// The UI's handle on the compile service (design.md §6.1, §10). The compile
// module is loaded with a dynamic import() the first time it is needed, so
// the Anthropic SDK is not part of the runtime chunk and is not loaded until
// the author presses Save (or views a card compiled in this browser, whose
// stale-description notice needs the description hash).
import type { CompileContext, CompileResult, ObjectName } from '../compile'
import { parse } from '../parser'
import type { Program } from '../parser'
import type { StorageLike } from '../store'
import type { ProviderChoice } from './settings'

export interface Compiler {
  /** `context` carries the objects of the card the description belongs to. */
  compile(description: string, provider: ProviderChoice, context: CompileContext, signal: AbortSignal): Promise<CompileResult>
  descriptionHash(description: string): Promise<string>
  /**
   * The objects `script` names that `objects` does not contain (design.md §6.8);
   * empty for a script that does not parse. The description panel uses it to
   * decide which bundled-description chips fit the rendered card.
   */
  missingObjects(script: string, objects: readonly ObjectName[]): readonly ObjectName[]
}

export type LoadCompiler = () => Promise<Compiler>

/** Parsed scripts by source text, so each bundled example is parsed once however often chips render. */
const parsedScripts = new Map<string, Program | null>()

function parseOnce(script: string): Program | null {
  let program = parsedScripts.get(script)
  if (program === undefined) {
    const result = parse(script)
    program = result.ok ? result.program : null
    parsedScripts.set(script, program)
  }
  return program
}

/** Loads src/compile lazily, once, and binds the Anthropic provider to `storage` for its key. */
export function lazyCompiler(storage: StorageLike): LoadCompiler {
  let loaded: Promise<Compiler> | null = null
  return () => {
    loaded ??= import('../compile').then((mod) => ({
      compile: (description, provider, context, signal) =>
        mod.compile(
          description,
          provider === 'anthropic' ? mod.createAnthropicProvider({ storage }) : mod.createCannedProvider(),
          context,
          signal,
        ),
      descriptionHash: mod.descriptionHash,
      missingObjects: (script, objects) => {
        const program = parseOnce(script)
        return program === null ? [] : mod.missingObjects(program, objects)
      },
    }))
    return loaded
  }
}
