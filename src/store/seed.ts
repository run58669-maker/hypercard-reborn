// Seeded cards from the bundled examples (design.md §3.2).
import { EXAMPLES } from '../examples'
import type { Card } from './types'

export function seedCards(at: Date): readonly Card[] {
  return EXAMPLES.map((example, index) => ({
    id: example.id,
    number: index + 1,
    name: example.title,
    description: example.description,
    script: example.script,
    scriptOrigin: { kind: 'seed' },
    objects: example.objects,
    updatedAt: at.toISOString(),
  }))
}
