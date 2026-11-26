import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import type { Program } from '../parser'
import { deepScripts, ifs, parentheses } from '../parser/deepScripts'
import { referencedObjects } from './objectCheck'

// Requirement 7.5 (task 18.1): the object references of a script that parses
// can be collected, however its 64 levels are spent. The scripts come from
// src/parser/deepScripts.ts.

function parsed(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${String(result.error.line)})`)
  return result.program
}

describe('referencedObjects at the nesting limit', () => {
  it.each(deepScripts(64).map((script) => [script.label, script.source]))('walks %s without throwing', (_label, source) => {
    expect(referencedObjects(parsed(source))).toEqual([])
  })

  it('finds a field at the bottom of 64 parentheses and of 64 nested if', () => {
    const deep = parentheses(64).source.replace('(1)', '(field "deep")')
    const nested = ifs(64).source.replace('put 1 into x', 'put 1 into field "deep"')
    expect(referencedObjects(parsed(deep))).toEqual([{ kind: 'field', name: 'deep' }])
    expect(referencedObjects(parsed(nested))).toEqual([{ kind: 'field', name: 'deep' }])
  })
})
