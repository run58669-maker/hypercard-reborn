// Task 13.3: the built bundle keeps the interpreter and the Anthropic SDK in
// separate chunks (design.md §10). Runs `vite build --mode chunks` into a
// temporary directory, finds the chunk that contains the interpreter by the
// marker exported from src/interpreter/index.ts, and asserts it mentions
// neither "anthropic" nor "api.anthropic.com", while a different chunk does
// contain "api.anthropic.com". The default build inlines everything into one
// file so dist/ opens from file://; the chunked build exposes the same module
// graph with its boundaries visible.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const MARKER = 'hcr-interpreter-chunk-marker'

function buildChunks(): Map<string, string> {
  const outDir = mkdtempSync(join(tmpdir(), 'hcr-bundle-check-'))
  try {
    execFileSync('npx', ['vite', 'build', '--mode', 'chunks', '--outDir', outDir, '--emptyOutDir'], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    const assets = join(outDir, 'assets')
    const chunks = new Map<string, string>()
    for (const file of readdirSync(assets)) {
      if (file.endsWith('.js')) chunks.set(file, readFileSync(join(assets, file), 'utf8'))
    }
    return chunks
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

describe('bundle check', () => {
  const chunks = buildChunks()

  it('builds more than one JavaScript chunk', () => {
    expect(chunks.size).toBeGreaterThan(1)
  })

  it('the chunk containing the interpreter mentions neither anthropic nor api.anthropic.com', () => {
    const withMarker = [...chunks].filter(([, code]) => code.includes(MARKER))
    expect(withMarker.map(([name]) => name)).toHaveLength(1)
    const [name, code] = withMarker[0] as [string, string]
    expect(code.toLowerCase(), `${name} must not reference the SDK`).not.toContain('anthropic')
    expect(code, `${name} must not reference the API host`).not.toContain('api.anthropic.com')
  })

  it('a separate chunk contains api.anthropic.com and that chunk has no interpreter marker', () => {
    const withHost = [...chunks].filter(([, code]) => code.includes('api.anthropic.com'))
    expect(withHost.map(([name]) => name)).toHaveLength(1)
    const [name, code] = withHost[0] as [string, string]
    expect(code, `${name} must not contain the interpreter`).not.toContain(MARKER)
  })

  it('the entry chunk reaches the compile chunk only through a dynamic import', () => {
    const entry = [...chunks].find(([, code]) => code.includes('hcrInterpreter'))
    expect(entry).toBeDefined()
    const [, code] = entry as [string, string]
    expect(code).not.toContain('api.anthropic.com')
    expect(code).toMatch(/import\(/)
  })
}, 120_000)
