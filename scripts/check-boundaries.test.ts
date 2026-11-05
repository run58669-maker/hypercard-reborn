// Task 1.3: proves that the module-boundary rules in eslint.config.js are live.
//
// It writes a temporary file into src/interpreter/ that imports the Anthropic
// SDK, runs ESLint programmatically on it, and asserts that the
// no-restricted-imports rule reports an error. The file is removed again in
// `finally`, so a crashed run cannot leave it behind as a real violation.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

async function lintTemporaryFile(directory: string, source: string): Promise<ESLint.LintResult> {
  // A unique sub-directory so parallel test runs cannot collide.
  const tempDir = mkdtempSync(join(projectRoot, directory, 'boundary-check-'))
  const file = join(tempDir, 'violation.ts')
  try {
    writeFileSync(file, source)
    const eslint = new ESLint({ cwd: projectRoot })
    const [result] = await eslint.lintFiles([file])
    if (result === undefined) throw new Error('ESLint returned no result')
    return result
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function restrictedImportMessages(result: ESLint.LintResult): string[] {
  return result.messages
    .filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message)
}

describe('module boundaries', () => {
  it('reports an error when src/interpreter imports @anthropic-ai/sdk', async () => {
    const result = await lintTemporaryFile(
      'src/interpreter',
      "import Anthropic from '@anthropic-ai/sdk'\nexport const client = Anthropic\n",
    )
    const messages = restrictedImportMessages(result)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('@anthropic-ai/sdk is reachable only from src/compile')
  })

  it('reports an error when src/runtime imports src/compile', async () => {
    const result = await lintTemporaryFile(
      'src/runtime',
      "import { compile } from '../../compile/compileService'\nexport const c = compile\n",
    )
    const messages = restrictedImportMessages(result)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('src/runtime may only import src/parser, src/interpreter, src/store')
  })

  it('allows src/ui to load src/compile only through a dynamic import()', async () => {
    const staticForm = await lintTemporaryFile(
      'src/ui',
      "import { compile } from '../../compile/compileService'\nexport const c = compile\n",
    )
    expect(restrictedImportMessages(staticForm)).toHaveLength(1)

    const dynamicForm = await lintTemporaryFile(
      'src/ui',
      "export const load = () => import('../../compile/compileService')\n",
    )
    expect(restrictedImportMessages(dynamicForm)).toHaveLength(0)
  })

  it('allows src/compile to import the SDK', async () => {
    const result = await lintTemporaryFile(
      'src/compile',
      "import Anthropic from '@anthropic-ai/sdk'\nexport const client = Anthropic\n",
    )
    expect(restrictedImportMessages(result)).toHaveLength(0)
  })
})
