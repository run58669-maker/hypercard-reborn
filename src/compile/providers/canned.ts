// The offline compile provider (design.md §6.3): looks the normalised
// description up among the six bundled examples and returns that example's
// script. No network, no key. Async only so the UI is identical for both
// providers.
import { EXAMPLES } from '../../examples'
import { normalise } from '../normalise'
import { NoCannedMatch, type CompileProvider } from '../types'

const SCRIPTS: ReadonlyMap<string, string> = new Map(EXAMPLES.map((example) => [normalise(example.description), example.script]))

export function createCannedProvider(): CompileProvider {
  return {
    id: 'canned',
    compile(description: string): Promise<string> {
      const script = SCRIPTS.get(normalise(description))
      if (script === undefined) return Promise.reject(new NoCannedMatch())
      return Promise.resolve(script)
    },
  }
}
