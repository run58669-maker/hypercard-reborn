// design.md §6.7: docs/grammar.md §8, the spec's examples/ directory and
// src/examples must agree byte for byte, every script must parse, and the
// grammar's reserved-word list must equal the lexer's keyword table.
import { describe, expect, it } from 'vitest'
import grammar from '../../docs/grammar.md?raw'
import { KEYWORDS } from '../parser/lexer'
import { parse } from '../parser'
import { EXAMPLES } from './index'

// Every file under the spec examples directory, keyed by "<id>.hc/<file>".
const specFiles: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../.kiro/specs/flip-card/examples/*.hc/*', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, content]) => [path.replace(/^.*\/examples\//, ''), content as string]),
)

interface GrammarExample {
  readonly n: number
  readonly id: string
  readonly description: string
  readonly script: string
}

function extractExamples(markdown: string): GrammarExample[] {
  const start = markdown.indexOf('\n## 8. Example scripts\n')
  if (start < 0) throw new Error('docs/grammar.md has no "## 8. Example scripts" section')
  const rest = markdown.slice(start + 1)
  const nextHeading = rest.indexOf('\n## ', 1)
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1)
  const pattern = /### Example (\d+): `([^`\n]+)`\n\n\*\*Description:\*\* ([^\n]+)\n\n```hypertalk\n(.*?)```\n/gs
  const examples: GrammarExample[] = []
  for (const match of section.matchAll(pattern)) {
    examples.push({ n: Number(match[1]), id: match[2] as string, description: match[3] as string, script: match[4] as string })
  }
  return examples
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

const grammarExamples = extractExamples(grammar)

describe('docs/grammar.md §8', () => {
  it('contains exactly six examples numbered 1..6 in order', () => {
    expect(grammarExamples.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it.each(grammarExamples.map((e) => [e.id, e] as const))(
    'example %s is byte-identical to the spec examples directory',
    (id, example) => {
      const description = specFiles[`${id}.hc/description.txt`]
      const script = specFiles[`${id}.hc/script.hc`]
      expect(description, `examples/${id}.hc/description.txt is missing`).toBeDefined()
      expect(script, `examples/${id}.hc/script.hc is missing`).toBeDefined()
      expect(bytes(description as string), `description.txt for "${id}" differs from docs/grammar.md`).toEqual(bytes(example.description))
      expect(bytes(script as string), `script.hc for "${id}" differs from docs/grammar.md`).toEqual(bytes(example.script))
    },
  )

  it('has no example files beyond the six', () => {
    const ids = new Set(Object.keys(specFiles).map((key) => key.split('/')[0]?.replace(/\.hc$/, '')))
    expect([...ids].sort()).toEqual(grammarExamples.map((e) => e.id).sort())
    expect(Object.keys(specFiles)).toHaveLength(12)
  })
})

describe('src/examples', () => {
  it('exports the same six in the same order', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(grammarExamples.map((e) => e.id))
  })

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('example %s ships the same bytes', (id, example) => {
    const fromGrammar = grammarExamples.find((e) => e.id === id)
    expect(fromGrammar, `"${id}" is not in docs/grammar.md`).toBeDefined()
    expect(bytes(example.description), `src/examples description for "${id}"`).toEqual(bytes(fromGrammar?.description ?? ''))
    expect(bytes(example.script), `src/examples script for "${id}"`).toEqual(bytes(fromGrammar?.script ?? ''))
  })

  it.each(EXAMPLES.map((e) => [e.id, e.script] as const))('example %s parses', (id, script) => {
    const result = parse(script)
    expect(result.ok, `script for "${id}" does not parse: ${result.ok ? '' : result.error.message}`).toBe(true)
    if (result.ok) expect(result.program.source).toBe(script)
  })
})

describe('reserved words', () => {
  it('equal the lexer keyword table', () => {
    const match = /- Reserved words \(cannot be used as variable names\): `([^`]+)`\./.exec(grammar)
    expect(match).not.toBeNull()
    const listed = (match?.[1] ?? '').split(/\s+/).filter((w) => w.length > 0)
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...KEYWORDS].sort())
  })
})
