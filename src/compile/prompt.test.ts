import { describe, expect, it } from 'vitest'
import grammar from '../../docs/grammar.md?raw'
import { EXAMPLES } from '../examples'
import { buildSystemPrompt, SYSTEM_PROMPT } from './prompt'

describe('buildSystemPrompt', () => {
  it('is pure', () => {
    expect(buildSystemPrompt('G', [])).toBe(buildSystemPrompt('G', []))
    expect(buildSystemPrompt('G', [])).toContain('G')
  })

  it('renders each example as a Description line followed by its script', () => {
    const prompt = buildSystemPrompt('G', EXAMPLES.slice(0, 2))
    const [hello, counter] = EXAMPLES
    expect(prompt).toContain(`Description: ${hello?.description ?? ''}\n\n${hello?.script ?? ''}\nDescription: ${counter?.description ?? ''}`)
  })
})

describe('SYSTEM_PROMPT', () => {
  it('contains the full grammar text', () => {
    expect(SYSTEM_PROMPT).toContain(grammar.trimEnd())
  })

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('contains the %s description and script', (_id, example) => {
    expect(SYSTEM_PROMPT).toContain(`Description: ${example.description}`)
    expect(SYSTEM_PROMPT).toContain(example.script)
  })

  it('matches the snapshot', () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot()
  })
})
