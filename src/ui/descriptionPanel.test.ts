// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { CompileResult } from '../compile'
import { EXAMPLES } from '../examples'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { createCardView } from './cardView'
import type { Compiler } from './compiler'
import { STALE_NOTICE } from './descriptionPanel'

const NOW = new Date(2026, 10, 1, 15, 4)
const counter = EXAMPLES[1]
if (counter === undefined) throw new Error('no counter example')

/** A fake compiler: a fixed hash per normalised text, and a scripted compile. */
function fakeCompiler(compileImpl: (description: string) => CompileResult) {
  const hash = (text: string): Promise<string> => Promise.resolve(`hash:${text.trim().toLowerCase()}`)
  const spy = vi.fn((description: string) => Promise.resolve(compileImpl(description)))
  const compiler: Compiler = { compile: (description) => spy(description), descriptionHash: hash }
  return { compiler, spy }
}

function ok(description: string, script: string): CompileResult {
  return { ok: true, script, descriptionHash: `hash:${description.trim().toLowerCase()}`, provider: 'canned' }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function setup(compiler: Compiler, id = 'hello', provider: 'canned' | 'anthropic' = 'canned') {
  const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
  const runtime = createCardRuntime({ cardCount: () => 6, onNavigate: () => undefined, now: () => NOW })
  const card = store.getCard(id)
  if (card === undefined) throw new Error(`no card ${id}`)
  const view = createCardView(card, { store, runtime, provider: () => provider, loadCompiler: () => Promise.resolve(compiler), now: () => NOW })
  document.body.replaceChildren(view.element)
  view.show()
  view.flip()
  const q = <T extends HTMLElement>(testid: string) => view.element.querySelector<T>(`[data-testid="${testid}"]`)
  const input = q<HTMLTextAreaElement>('description-input')
  const save = q<HTMLButtonElement>('save-description')
  if (input === null || save === null) throw new Error('no description panel')
  return { store, runtime, view, q, input, save }
}

describe('description panel', () => {
  it('shows the description, the chips for the offline provider and the origin line', () => {
    const { q, input } = setup(fakeCompiler(() => ok('', '')).compiler)
    expect(input.value).toBe(EXAMPLES[0]?.description)
    expect(input.readOnly).toBe(false)
    for (const example of EXAMPLES) expect(q(`chip-${example.id}`)?.textContent).toBe(example.title)
    expect(q('script-origin')?.textContent).toBe('bundled example')
    expect(q('compile-error')?.hidden).toBe(true)
    expect(q('stale-notice')?.hidden).toBe(true)
  })

  it('hides the chips for the Anthropic provider', () => {
    const { q } = setup(fakeCompiler(() => ok('', '')).compiler, 'hello', 'anthropic')
    expect(q('chip-hello')).toBeNull()
  })

  it('a chip fills the description without saving', () => {
    const { q, input, store } = setup(fakeCompiler(() => ok('', '')).compiler)
    q<HTMLButtonElement>('chip-counter')?.click()
    expect(input.value).toBe(counter.description)
    expect(store.getCard('hello')?.description).toBe(EXAMPLES[0]?.description)
  })

  it('Save saves the description, compiles once, commits the script and re-runs the card', async () => {
    const { compiler, spy } = fakeCompiler((d) => ok(d, counter.script))
    const { q, input, save, store, runtime } = setup(compiler)
    input.value = counter.description
    save.click()
    expect(save.disabled).toBe(true)
    expect(q('compile-status')?.textContent).toBe('Compiling…')
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toBe(counter.description)
    expect(store.getCard('hello')?.description).toBe(counter.description)
    expect(store.getCard('hello')?.script).toBe(counter.script)
    expect(store.getCard('hello')?.scriptOrigin).toEqual({
      kind: 'compiled',
      provider: 'canned',
      descriptionHash: `hash:${counter.description.toLowerCase()}`,
      at: NOW.toISOString(),
    })
    expect(runtime.currentProgram('hello')?.source).toBe(counter.script)
    expect(q('stored-script')?.textContent).toBe(counter.script)
    expect(q<HTMLTextAreaElement>('script-editor')?.value).toBe(counter.script)
    expect(q('script-origin')?.textContent).toMatch(/^compiled offline at /)
    expect(save.disabled).toBe(false)
    expect(q('compile-error')?.hidden).toBe(true)
    expect(q('stale-notice')?.hidden).toBe(true)
  })

  it('a double click produces one compile call', async () => {
    const { compiler, spy } = fakeCompiler((d) => ok(d, ''))
    const { save } = setup(compiler)
    save.click()
    save.click()
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('invalid-script shows the parse error and the rejected candidate; the previous script keeps running', async () => {
    const candidate = 'on openCard\n  put 1 into button "b"\nend openCard\n'
    const { compiler } = fakeCompiler(() => ({
      ok: false,
      error: {
        kind: 'invalid-script',
        message: 'The compiler produced a script that does not parse (line 2, column 14: cannot put into a button; use set name of button). The previous script is still running.',
        parseError: { line: 2, column: 14, message: 'cannot put into a button; use set name of button', near: '  put 1 into button "b"' },
        candidate,
      },
    }))
    const { q, input, save, store } = setup(compiler)
    const before = store.getCard('hello')?.script
    input.value = 'Something new.'
    save.click()
    await flush()
    expect(q('compile-error')?.hidden).toBe(false)
    expect(q('compile-error')?.textContent).toContain('does not parse (line 2, column 14: cannot put into a button; use set name of button). The previous script is still running.')
    expect(q('compile-candidate')?.textContent).toBe(candidate)
    expect(store.getCard('hello')?.description).toBe('Something new.')
    expect(store.getCard('hello')?.script).toBe(before)
    expect(q('stored-script')?.textContent).toBe(before)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, world!')
  })

  it('no-canned-match shows the message and no candidate', async () => {
    const message = 'The offline compiler only knows the six bundled descriptions. Pick one from the list, or add an Anthropic key in Settings.'
    const { compiler } = fakeCompiler(() => ({ ok: false, error: { kind: 'no-canned-match', message } }))
    const { q, input, save, store } = setup(compiler)
    const before = store.getCard('hello')?.script
    input.value = 'Make the card purple.'
    save.click()
    await flush()
    expect(q('compile-error')?.textContent).toBe(message)
    expect(q('compile-candidate')).toBeNull()
    expect(store.getCard('hello')?.script).toBe(before)
  })

  it('shows the stale notice when the saved description no longer matches the compiled hash', async () => {
    const { compiler } = fakeCompiler((d) => ok(d, ''))
    const { q, input, save, store, view } = setup(compiler)
    input.value = 'First.'
    save.click()
    await flush()
    expect(q('stale-notice')?.hidden).toBe(true)
    store.saveDescription('hello', 'Second.')
    view.refresh()
    await flush()
    expect(q('stale-notice')?.hidden).toBe(false)
    expect(q('stale-notice')?.textContent).toBe(STALE_NOTICE)
  })

  it('reports a compiler that throws without leaving Save disabled', async () => {
    const compiler: Compiler = { compile: () => Promise.reject(new Error('boom')), descriptionHash: () => Promise.resolve('') }
    const { q, save } = setup(compiler)
    save.click()
    await flush()
    expect(q('compile-error')?.textContent).toBe('Compiling failed for an unexpected reason: boom.')
    expect(save.disabled).toBe(false)
  })
})
