// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { CompileResult } from '../compile'
import { EXAMPLES } from '../examples'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { createCardView } from './cardView'
import { lazyCompiler, type Compiler } from './compiler'
import { DESCRIPTION_NOT_SAVED, SAVE_OVERTAKEN, SCRIPT_NOT_SAVED, STALE_NOTICE, unfitChipTitle } from './descriptionPanel'

const NOW = new Date(2026, 10, 1, 15, 4)
const counter = EXAMPLES[1]
if (counter === undefined) throw new Error('no counter example')

// The real object check (src/compile/objectCheck.ts through the lazy loader), so the
// chip tests exercise the same code the app runs. Nothing here reads the storage.
const real = await lazyCompiler({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined })()

/** A fake compiler: a fixed hash per normalised text, a scripted compile, the real object check. */
function fakeCompiler(compileImpl: (description: string) => CompileResult) {
  const hash = (text: string): Promise<string> => Promise.resolve(`hash:${text.trim().toLowerCase()}`)
  const spy = vi.fn((description: string, objects: readonly { kind: string; name: string }[]) => {
    void objects
    return Promise.resolve(compileImpl(description))
  })
  const compiler: Compiler = {
    compile: (description, _provider, context) => spy(description, context.objects),
    descriptionHash: hash,
    missingObjects: (script, objects) => real.missingObjects(script, objects),
  }
  return { compiler, spy }
}

function ok(description: string, script: string): CompileResult {
  return { ok: true, script, descriptionHash: `hash:${description.trim().toLowerCase()}`, provider: 'canned' }
}

/** A compiler whose answer the test holds back: `answer` settles the one compile in flight. */
function heldCompiler() {
  let settle: (result: CompileResult) => void = () => undefined
  const spy = vi.fn(
    () =>
      new Promise<CompileResult>((resolve) => {
        settle = resolve
      }),
  )
  const compiler: Compiler = {
    compile: () => spy(),
    descriptionHash: (text) => Promise.resolve(`hash:${text.trim().toLowerCase()}`),
    missingObjects: (script, objects) => real.missingObjects(script, objects),
  }
  return {
    compiler,
    spy,
    answer: (result: CompileResult): void => {
      settle(result)
    },
  }
}

const COMMITTED = 'on openCard\n  put "committed by hand" into field "greeting"\nend openCard\n'
const COMPILED = 'on openCard\n  put "compiled" into field "greeting"\nend openCard\n'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

/** `storage.full` makes the store's write throw, as localStorage does when its quota is used up. */
function setup(compiler: Compiler, id = 'hello', provider: 'canned' | 'anthropic' = 'canned', storage = { full: false }) {
  const store = createCardStore({
    initial: seedCards(NOW),
    now: () => NOW,
    persist: () => {
      if (storage.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    },
  })
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
  it('shows the description, the chips for the offline provider and the origin line', async () => {
    const { q, input } = setup(fakeCompiler(() => ok('', '')).compiler)
    await flush()
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

  it('a chip that fits the card fills the description without saving', async () => {
    const { q, input, store } = setup(fakeCompiler(() => ok('', '')).compiler, 'counter')
    await flush()
    input.value = 'Something else.'
    const chip = q<HTMLButtonElement>('chip-counter')
    expect(chip?.disabled).toBe(false)
    expect(chip?.title).toBe(counter.description)
    chip?.click()
    expect(input.value).toBe(counter.description)
    expect(store.getCard('counter')?.description).toBe(counter.description)
  })

  it('on the Hello card only the Hello chip is enabled; the others say which card to open', async () => {
    const { q } = setup(fakeCompiler(() => ok('', '')).compiler)
    await flush()
    for (const example of EXAMPLES) {
      const chip = q<HTMLButtonElement>(`chip-${example.id}`)
      expect(chip?.disabled, example.id).toBe(example.id !== 'hello')
      expect(chip?.title, example.id).toBe(example.id === 'hello' ? example.description : unfitChipTitle(example.title))
    }
    expect(q<HTMLButtonElement>('chip-counter')?.title).toBe('Needs objects this card does not have. Open the Counter card to use it.')
  })

  it('on the Counter card the Counter chip is enabled and the Hello chip is not', async () => {
    const { q } = setup(fakeCompiler(() => ok('', '')).compiler, 'counter')
    await flush()
    expect(q<HTMLButtonElement>('chip-counter')?.disabled).toBe(false)
    expect(q<HTMLButtonElement>('chip-hello')?.disabled).toBe(true)
    expect(q<HTMLButtonElement>('chip-hello')?.title).toContain('Hello')
  })

  it('a disabled chip leaves the description unchanged, whether clicked or sent a click event', async () => {
    const { q, input } = setup(fakeCompiler(() => ok('', '')).compiler)
    await flush()
    const chip = q<HTMLButtonElement>('chip-counter')
    expect(chip?.disabled).toBe(true)
    chip?.click()
    expect(input.value).toBe(EXAMPLES[0]?.description)
    // A disabled button drops real clicks; the handler is called here directly to check its own guard.
    if (chip !== null) chip.disabled = false
    chip?.setAttribute('disabled', '')
    chip?.dispatchEvent(new MouseEvent('click'))
    expect(input.value).toBe(EXAMPLES[0]?.description)
  })

  it('chips are disabled until the object check has loaded', () => {
    const { q } = setup(fakeCompiler(() => ok('', '')).compiler)
    for (const example of EXAMPLES) expect(q<HTMLButtonElement>(`chip-${example.id}`)?.disabled, example.id).toBe(true)
  })

  it('chips stay disabled when the compile module cannot be loaded', async () => {
    const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
    const runtime = createCardRuntime({ cardCount: () => 6, onNavigate: () => undefined, now: () => NOW })
    const card = store.getCard('hello')
    if (card === undefined) throw new Error('no card hello')
    const view = createCardView(card, { store, runtime, provider: () => 'canned', loadCompiler: () => Promise.reject(new Error('offline')), now: () => NOW })
    document.body.replaceChildren(view.element)
    view.show()
    view.flip()
    await flush()
    expect(view.element.querySelector<HTMLButtonElement>('[data-testid="chip-hello"]')?.disabled).toBe(true)
  })

  it('Save passes the objects of the card to the compiler', async () => {
    const { compiler, spy } = fakeCompiler((d) => ok(d, counter.script))
    const { save, store } = setup(compiler, 'counter')
    save.click()
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toEqual(store.getCard('counter')?.objects)
    expect(spy.mock.calls[0]?.[1].map((o) => `${o.kind} ${o.name}`)).toEqual(counter.objects.map((o) => `${o.kind} ${o.name}`))
  })

  it('unknown-object shows the message and the rejected candidate and commits nothing', async () => {
    const message =
      'The compiled script refers to field "count", which this card does not have. This card has: field "greeting". The previous script is still running.'
    const { compiler } = fakeCompiler(() => ({
      ok: false,
      error: { kind: 'unknown-object', message, missing: [{ kind: 'field', name: 'count' }], candidate: counter.script },
    }))
    const { q, input, save, store } = setup(compiler)
    const commit = vi.spyOn(store, 'commitScript')
    const before = store.getCard('hello')?.script
    input.value = counter.description
    save.click()
    await flush()
    expect(q('compile-error')?.hidden).toBe(false)
    expect(q('compile-error')?.textContent).toContain(message)
    expect(q('compile-candidate')?.textContent).toBe(counter.script)
    expect(commit).not.toHaveBeenCalled()
    expect(store.getCard('hello')?.script).toBe(before)
    expect(store.getCard('hello')?.scriptOrigin.kind).toBe('seed')
    expect(q('stored-script')?.textContent).toBe(before)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, world!')
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

  // Task 19.1, requirement 8.3.
  it('a description that storage refuses: the message, the typed text kept, no compile call', async () => {
    const storage = { full: true }
    const { compiler, spy } = fakeCompiler((d) => ok(d, ''))
    const { q, input, save, store } = setup(compiler, 'hello', 'canned', storage)
    await flush()
    const before = store.getCard('hello')
    input.value = 'Typed and not yet stored.'
    save.click()
    await flush()
    expect(q('compile-error')?.hidden).toBe(false)
    expect(q('compile-error')?.textContent).toBe(DESCRIPTION_NOT_SAVED)
    expect(DESCRIPTION_NOT_SAVED).toBe(
      "The description was not saved: the browser's storage is full or unavailable. Nothing was compiled, and your text is kept here.",
    )
    expect(q('compile-candidate')).toBeNull()
    expect(input.value).toBe('Typed and not yet stored.')
    expect(spy).not.toHaveBeenCalled()
    expect(store.getCard('hello')).toBe(before)
    expect(save.disabled).toBe(false)
    expect(q('compile-status')?.textContent).toBe('')

    // With room again the same press stores the text and compiles it.
    storage.full = false
    save.click()
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.getCard('hello')?.description).toBe('Typed and not yet stored.')
    expect(q('compile-error')?.hidden).toBe(true)
  })

  it('a compiled script that storage refuses: the message, the description stored, the previous script still running', async () => {
    const storage = { full: false }
    const edited = 'on openCard\n  put "compiled" into field "greeting"\nend openCard\n'
    const { compiler, spy } = fakeCompiler((d) => {
      // The description is in; storage fills up while the compile is under way.
      storage.full = true
      return ok(d, edited)
    })
    const { q, input, save, store, runtime } = setup(compiler, 'hello', 'canned', storage)
    await flush()
    const script = store.getCard('hello')?.script
    const field = q<HTMLTextAreaElement>('field-greeting')
    if (field === null) throw new Error('no field')
    field.value = 'typed on the front'
    input.value = 'Say compiled.'
    save.click()
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(q('compile-error')?.textContent).toBe(SCRIPT_NOT_SAVED)
    expect(SCRIPT_NOT_SAVED).toBe(
      "The compiled script was not saved: the browser's storage is full or unavailable. The previous script is still running.",
    )
    expect(q('compile-candidate')).toBeNull()
    expect(store.getCard('hello')?.description).toBe('Say compiled.')
    expect(input.value).toBe('Say compiled.')
    expect(store.getCard('hello')?.script).toBe(script)
    expect(store.getCard('hello')?.scriptOrigin).toEqual({ kind: 'seed' })
    expect(q('stored-script')?.textContent).toBe(script)
    expect(q<HTMLTextAreaElement>('script-editor')?.value).toBe(script)
    expect(runtime.currentProgram('hello')?.source).toBe(script)
    expect(field.value).toBe('typed on the front')
    expect(save.disabled).toBe(false)
  })

  // Task 19.2, requirement 8.5: a Save that answers after a Commit or a Reset stores nothing.
  describe('a Save that answers late', () => {
    /** Presses Save with `description` typed and waits until the compile is in flight. */
    async function saving(description: string) {
      const held = heldCompiler()
      const page = setup(held.compiler)
      await flush()
      page.input.value = description
      page.save.click()
      await flush()
      expect(held.spy).toHaveBeenCalledTimes(1)
      expect(page.save.disabled).toBe(true)
      return { ...held, ...page }
    }

    /** Commits `script` through the editor on the same card, as the author would. */
    function commitByHand(q: <T extends HTMLElement>(testid: string) => T | null, script: string): void {
      const editor = q<HTMLTextAreaElement>('script-editor')
      if (editor === null) throw new Error('no editor')
      editor.value = script
      editor.dispatchEvent(new Event('input'))
      q<HTMLButtonElement>('commit-script')?.click()
    }

    it('after a Commit: the committed script stays stored and running, commitScript is not called, and the panel says the card changed', async () => {
      const { q, input, save, store, runtime, spy, answer } = await saving('Say compiled.')
      commitByHand(q, COMMITTED)
      expect(store.getCard('hello')?.script).toBe(COMMITTED)
      const committed = store.getCard('hello')
      const commit = vi.spyOn(store, 'commitScript')

      answer(ok('Say compiled.', COMPILED))
      await flush()
      expect(commit).not.toHaveBeenCalled()
      expect(store.getCard('hello')).toBe(committed)
      expect(store.getCard('hello')?.scriptOrigin).toEqual({ kind: 'edited', at: NOW.toISOString() })
      expect(runtime.currentProgram('hello')?.source).toBe(COMMITTED)
      expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('committed by hand')
      expect(q('stored-script')?.textContent).toBe(COMMITTED)
      expect(q('compile-error')?.hidden).toBe(false)
      expect(q('compile-error')?.textContent).toBe(SAVE_OVERTAKEN)
      expect(SAVE_OVERTAKEN).toBe(
        'The card changed while this description was compiling, so the compiled script was not stored. Press Save to compile it again.',
      )
      expect(q('compile-candidate')).toBeNull()
      expect(store.getCard('hello')?.description).toBe('Say compiled.')
      expect(input.value).toBe('Say compiled.')
      expect(save.disabled).toBe(false)
      expect(q('compile-status')?.textContent).toBe('')

      // Pressing Save again, as the message says, compiles once more and stores the answer.
      commit.mockRestore()
      save.click()
      await flush()
      expect(spy).toHaveBeenCalledTimes(2)
      answer(ok('Say compiled.', COMPILED))
      await flush()
      expect(store.getCard('hello')?.script).toBe(COMPILED)
      expect(q('compile-error')?.hidden).toBe(true)
    })

    it('after a Reset: the bundled script and description stay, commitScript is not called, and the panel says the card changed', async () => {
      const { q, input, save, store, runtime, answer } = await saving('Say compiled.')
      expect(store.resetToSeed()).toEqual({ ok: true })
      const reset = store.getCard('hello')
      const commit = vi.spyOn(store, 'commitScript')

      answer(ok('Say compiled.', COMPILED))
      await flush()
      expect(commit).not.toHaveBeenCalled()
      expect(store.getCard('hello')).toBe(reset)
      expect(store.getCard('hello')?.script).toBe(EXAMPLES[0]?.script)
      expect(store.getCard('hello')?.scriptOrigin).toEqual({ kind: 'seed' })
      expect(store.getCard('hello')?.description).toBe(EXAMPLES[0]?.description)
      expect(runtime.currentProgram('hello')?.source).toBe(EXAMPLES[0]?.script)
      expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, world!')
      expect(q('compile-error')?.textContent).toBe(SAVE_OVERTAKEN)
      expect(input.value).toBe(EXAMPLES[0]?.description)
      expect(save.disabled).toBe(false)
    })

    it('with nothing in between, and with a Commit on another card in between, the compiled script is stored', async () => {
      const { q, store, runtime, answer } = await saving('Say compiled.')
      expect(store.commitScript('counter', '', { kind: 'edited', at: NOW.toISOString() }).ok).toBe(true)

      answer(ok('Say compiled.', COMPILED))
      await flush()
      expect(store.getCard('hello')?.script).toBe(COMPILED)
      expect(store.getCard('hello')?.scriptOrigin.kind).toBe('compiled')
      expect(runtime.currentProgram('hello')?.source).toBe(COMPILED)
      expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('compiled')
      expect(q('compile-error')?.hidden).toBe(true)
    })

    it('a compile error that arrives after a Commit is shown as before, and the committed script stays', async () => {
      const message = 'The offline compiler only knows the six bundled descriptions. Pick one from the list, or add an Anthropic key in Settings.'
      const { q, store, answer } = await saving('Make the card purple.')
      commitByHand(q, COMMITTED)

      answer({ ok: false, error: { kind: 'no-canned-match', message } })
      await flush()
      expect(q('compile-error')?.textContent).toBe(message)
      expect(store.getCard('hello')?.script).toBe(COMMITTED)
    })
  })

  it('reports a compiler that throws without leaving Save disabled', async () => {
    const compiler: Compiler = { compile: () => Promise.reject(new Error('boom')), descriptionHash: () => Promise.resolve(''), missingObjects: () => [] }
    const { q, save } = setup(compiler)
    save.click()
    await flush()
    expect(q('compile-error')?.textContent).toBe('Compiling failed for an unexpected reason: boom.')
    expect(save.disabled).toBe(false)
  })
})
