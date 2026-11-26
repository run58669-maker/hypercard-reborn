import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import type { Program } from '../parser'
import { deepScripts } from '../parser/deepScripts'
import { FakeHost } from './fakeHost'
import { run } from './interpreter'

// Requirement 7.5 (task 18.1): a script that parses can be run, however its 64
// levels are spent. The scripts come from src/parser/deepScripts.ts.

const NOW = new Date(2026, 10, 1, 15, 4)

function parsed(source: string): Program {
  const result = parse(source)
  if (!result.ok) throw new Error(`parse failed: ${result.error.message} (line ${String(result.error.line)})`)
  return result.program
}

describe('run at the nesting limit', () => {
  it.each(deepScripts(64).map((script) => [script.label, script.source]))('runs %s without throwing', (_label, source) => {
    const host = new FakeHost([], NOW)
    expect(run(parsed(source), 'mouseUp', host, { target: '' }).ok).toBe(true)
  })
})
