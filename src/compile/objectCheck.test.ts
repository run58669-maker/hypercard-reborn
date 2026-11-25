import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EXAMPLES, exampleById } from '../examples'
import { parse } from '../parser'
import type { Program } from '../parser'
import { arbProgram } from '../parser/arbitraries'
import { print } from '../parser/printer'
import { missingObjects, referencedObjects } from './objectCheck'
import type { ObjectName } from './objectCheck'

function parsed(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${result.error.line})\n${source}`)
  return result.program
}

function inMouseUp(...lines: string[]): Program {
  return parsed(`on mouseUp\n${lines.map((line) => `  ${line}`).join('\n')}\nend mouseUp\n`)
}

const field = (name: string): ObjectName => ({ kind: 'field', name })
const button = (name: string): ObjectName => ({ kind: 'button', name })

function example(id: string) {
  const found = exampleById(id)
  if (found === undefined) throw new Error(`no example ${id}`)
  return found
}

/** Independent oracle: every node with kind 'objectRef' anywhere in a value, by a generic deep walk. */
function deepObjectRefs(value: unknown, out: ObjectName[] = []): ObjectName[] {
  if (Array.isArray(value)) {
    for (const item of value) deepObjectRefs(item, out)
  } else if (value !== null && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (node.kind === 'objectRef') out.push({ kind: node.objectKind as ObjectName['kind'], name: node.name as string })
    for (const item of Object.values(node)) deepObjectRefs(item, out)
  }
  return out
}

describe('referencedObjects on the bundled examples', () => {
  it('has six examples to check', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(['hello', 'counter', 'date-stamp', 'greeter', 'countdown', 'quiz'])
  })

  it.each(EXAMPLES.map((e) => [e.id] as const))('%s: yields exactly the fields of its own layout and no button', (id) => {
    const ex = example(id)
    const refs = referencedObjects(parsed(ex.script))
    const fields = ex.objects.filter((o) => o.kind === 'field').map((o) => field(o.name))
    const byName = (a: ObjectName, b: ObjectName) => a.name.localeCompare(b.name)
    expect([...refs].sort(byName)).toEqual([...fields].sort(byName))
    expect(refs.filter((r) => r.kind === 'button')).toEqual([])
    expect(missingObjects(parsed(ex.script), ex.objects)).toEqual([])
  })

  it('Counter script on the Hello layout: field "count" is missing, reported once', () => {
    const counter = parsed(example('counter').script)
    expect(example('counter').script.match(/field "count"/g)?.length).toBeGreaterThan(1)
    expect(missingObjects(counter, example('hello').objects)).toEqual([field('count')])
  })
})

describe('referencedObjects finds a reference in every position', () => {
  it('put value and put target', () => {
    expect(referencedObjects(inMouseUp('put field "a" into field "b"'))).toEqual([field('a'), field('b')])
  })

  it('put into a variable or the message box adds nothing', () => {
    expect(referencedObjects(inMouseUp('put 1 into x', 'put 2'))).toEqual([])
  })

  it('set: the object and the value', () => {
    expect(referencedObjects(inMouseUp('set visible of button "b" to field "a"'))).toEqual([button('b'), field('a')])
  })

  it('get, answer, go', () => {
    expect(referencedObjects(inMouseUp('get field "g"', 'answer field "a"', 'go to card field "c"'))).toEqual([
      field('g'),
      field('a'),
      field('c'),
    ])
  })

  it('show and hide', () => {
    expect(referencedObjects(inMouseUp('show field "s"', 'hide button "h"'))).toEqual([field('s'), button('h')])
  })

  it('if: condition, then, else (block form)', () => {
    const p = inMouseUp('if field "c" is 1 then', '  put 1 into field "t"', 'else', '  put 2 into field "e"', 'end if')
    expect(referencedObjects(p)).toEqual([field('c'), field('t'), field('e')])
  })

  it('if: single-line form with else', () => {
    const p = inMouseUp('if x then hide field "t"', 'else show field "e"')
    expect(referencedObjects(p)).toEqual([field('t'), field('e')])
  })

  it('repeat N times: the count and the body', () => {
    const p = inMouseUp('repeat field "n" times', '  hide button "b"', 'end repeat')
    expect(referencedObjects(p)).toEqual([field('n'), button('b')])
  })

  it('repeat with ... to: both bounds and the body', () => {
    const p = inMouseUp('repeat with i = field "from" to field "to"', '  show button "b"', 'end repeat')
    expect(referencedObjects(p)).toEqual([field('from'), field('to'), button('b')])
  })

  it('repeat with ... down to: both bounds and the body', () => {
    const p = inMouseUp('repeat with i = field "hi" down to field "lo"', '  show button "b"', 'end repeat')
    expect(referencedObjects(p)).toEqual([field('hi'), field('lo'), button('b')])
  })

  it('repeat while: the condition and the body', () => {
    const p = inMouseUp('repeat while field "w" < 3', '  put 1 into field "x"', 'end repeat')
    expect(referencedObjects(p)).toEqual([field('w'), field('x')])
  })

  it('repeat forever: the body', () => {
    const p = inMouseUp('repeat forever', '  put 1 into field "x"', 'end repeat')
    expect(referencedObjects(p)).toEqual([field('x')])
  })

  it('nested: a repeat inside an else inside a repeat', () => {
    const p = inMouseUp(
      'repeat 2 times',
      '  if x then',
      '    put 1 into y',
      '  else',
      '    repeat forever',
      '      hide field "deep"',
      '    end repeat',
      '  end if',
      'end repeat',
    )
    expect(referencedObjects(p)).toEqual([field('deep')])
  })

  it('right of a binary operator, and under unary operators', () => {
    expect(referencedObjects(inMouseUp('put 1 + field "r"'))).toEqual([field('r')])
    expect(referencedObjects(inMouseUp('put field "l" & 1'))).toEqual([field('l')])
    expect(referencedObjects(inMouseUp('put -field "m"', 'put not field "n"'))).toEqual([field('m'), field('n')])
  })

  it('both handlers, in source order', () => {
    const p = parsed('on openCard\n  hide field "first"\nend openCard\n\non mouseUp\n  hide field "second"\nend mouseUp\n')
    expect(referencedObjects(p)).toEqual([field('first'), field('second')])
  })
})

describe('what is not a reference', () => {
  it('a string compared with the target yields nothing', () => {
    expect(referencedObjects(inMouseUp('if the target is "Increment" then', '  put 1', 'end if'))).toEqual([])
  })

  it('the empty program yields nothing', () => {
    expect(referencedObjects(parsed(''))).toEqual([])
    expect(missingObjects(parsed(''), [])).toEqual([])
  })
})

describe('duplicates and matching', () => {
  it('keeps the first spelling and drops later ones that differ only in case', () => {
    const p = inMouseUp('hide field "Count"', 'show field "count"', 'show field "COUNT"')
    expect(referencedObjects(p)).toEqual([field('Count')])
  })

  it('a field and a button with the same name are two objects', () => {
    const p = inMouseUp('hide field "x"', 'hide button "x"')
    expect(referencedObjects(p)).toEqual([field('x'), button('x')])
  })

  it('field "Count" is not missing when the card has field "count"', () => {
    expect(missingObjects(inMouseUp('hide field "Count"'), [field('count')])).toEqual([])
  })

  it('button "count" is missing when the card has only field "count"', () => {
    expect(missingObjects(inMouseUp('hide button "count"'), [field('count')])).toEqual([button('count')])
  })

  it('names differing by more than case are different (a space matters)', () => {
    expect(missingObjects(inMouseUp('hide field "my count"'), [field('mycount')])).toEqual([field('my count')])
  })

  it('reports every missing object, in source order, when the card has none', () => {
    const p = inMouseUp('hide field "a"', 'hide button "b"', 'hide field "a"')
    expect(missingObjects(p, [])).toEqual([field('a'), button('b')])
  })
})

describe('property: nothing the printer writes is overlooked', () => {
  it('every ObjectRef in the reparsed printer output is returned, and nothing else', () => {
    fc.assert(
      fc.property(arbProgram, (program) => {
        const reparsed = parsed(print(program))
        const expected = deepObjectRefs(reparsed.handlers)
        const got = referencedObjects(reparsed)
        const key = (o: ObjectName) => `${o.kind}\u0000${o.name.toLowerCase()}`
        expect(new Set(got.map(key))).toEqual(new Set(expected.map(key)))
        expect(new Set(got.map(key)).size).toBe(got.length)
        // The generated tree (never parsed) gives the same answer as its printed form.
        expect(referencedObjects(program).map(key)).toEqual(got.map(key))
      }),
    )
  })
})
