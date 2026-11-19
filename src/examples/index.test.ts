import { describe, expect, it } from 'vitest'
import { EXAMPLES, exampleById } from './index'

describe('EXAMPLES', () => {
  it('holds six records with the ids in stack order', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(['hello', 'counter', 'date-stamp', 'greeter', 'countdown', 'quiz'])
  })

  it('has a non-empty description and a script ending in exactly one newline for every record', () => {
    for (const example of EXAMPLES) {
      expect(example.description.length).toBeGreaterThan(0)
      expect(example.description.endsWith('\n')).toBe(false)
      expect(example.script.endsWith('\n')).toBe(true)
      expect(example.script.endsWith('\n\n')).toBe(false)
    }
  })

  it('uses the layouts from design.md §3.2', () => {
    expect(exampleById('quiz')?.objects.map((o) => `${o.kind} ${o.name}`)).toEqual(['field question', 'field answer', 'button Check'])
    expect(exampleById('countdown')?.objects[0]?.rect).toEqual({ x: 32, y: 40, w: 200, h: 260 })
    expect(exampleById('nope')).toBeUndefined()
  })
})
