import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../../examples'
import { compile } from '../compileService'
import { NoCannedMatch } from '../types'
import { createCannedProvider } from './canned'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('canned provider', () => {
  const provider = createCannedProvider()

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('compiles the %s description to its own script byte for byte', async (_id, example) => {
    const script = await provider.compile(example.description, new AbortController().signal)
    expect(script).toBe(example.script)
    expect(bytes(script)).toEqual(bytes(example.script))
  })

  it('still hits on a whitespace, case and trailing-dot variant', async () => {
    const hello = EXAMPLES[0]
    if (hello === undefined) throw new Error('no examples')
    // The bundled description already ends with one full stop; the variant
    // re-adds it after upper-casing and re-spacing the text.
    const base = hello.description.replace(/\.$/, '')
    const variant = `  ${base.toUpperCase().replace(/ /g, '\n\t ')}. `
    expect(await provider.compile(variant, new AbortController().signal)).toBe(hello.script)
  })

  it('misses on an unknown description', async () => {
    await expect(provider.compile('Make the card purple.', new AbortController().signal)).rejects.toBeInstanceOf(NoCannedMatch)
  })

  it('goes through the service as no-canned-match', async () => {
    const result = await compile('Make the card purple.', provider)
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-canned-match' } })
  })

  it('reports provider id canned and no model', () => {
    expect(provider.id).toBe('canned')
    expect(provider.model).toBeUndefined()
  })
})
