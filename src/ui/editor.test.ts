// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { createCardView } from './cardView'
import { COMMIT_NOT_SAVED, createEditor } from './editor'

const NOW = new Date(2026, 10, 1, 15, 4)
const EDITED = 'on openCard\n  put "Hello, Kiro!" into field "greeting"\nend openCard\n'
const BROKEN = 'on openCard\n  put "Hello, Kiro!" into field "greeting"\nend mouseUp\n'

/** `storage.full` makes the store's write throw, as localStorage does when its quota is used up. */
function store(storage = { full: false }) {
  return createCardStore({
    initial: seedCards(NOW),
    now: () => NOW,
    persist: () => {
      if (storage.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    },
  })
}

/** The editor alone, against a store. */
function standalone(id = 'hello', storage = { full: false }) {
  const s = store(storage)
  const editor = createEditor({ store: s, cardId: id, now: () => NOW })
  document.body.replaceChildren(editor.element)
  const q = <T extends HTMLElement>(testid: string) => editor.element.querySelector<T>(`[data-testid="${testid}"]`)
  const textarea = q<HTMLTextAreaElement>('script-editor')
  if (textarea === null) throw new Error('no editor')
  return { store: s, editor, q, textarea }
}

/** The editor inside a running card view, so re-runs are observable. */
function inCard(id = 'hello', storage = { full: false }) {
  const s = store(storage)
  const runtime = createCardRuntime({ cardCount: () => 6, onNavigate: () => undefined, now: () => NOW })
  const card = s.getCard(id)
  if (card === undefined) throw new Error(`no card ${id}`)
  const view = createCardView(card, { store: s, runtime, now: () => NOW, provider: () => 'canned', loadCompiler: () => Promise.reject(new Error('not loaded in this test')) })
  document.body.replaceChildren(view.element)
  view.show()
  view.flip()
  const q = <T extends HTMLElement>(testid: string) => view.element.querySelector<T>(`[data-testid="${testid}"]`)
  const textarea = q<HTMLTextAreaElement>('script-editor')
  if (textarea === null) throw new Error('no editor')
  return { store: s, runtime, view, q, textarea }
}

describe('createEditor', () => {
  it('starts with a draft equal to the stored script and no error', () => {
    const { store: s, editor, q, textarea } = standalone()
    expect(textarea.value).toBe(s.getCard('hello')?.script)
    expect(editor.draft()).toBe(textarea.value)
    expect(q('parse-error')?.hidden).toBe(true)
  })

  it('commit is a no-op when the draft equals the stored script', () => {
    const { store: s, editor, q } = standalone()
    const changes: string[] = []
    s.subscribe((c) => changes.push(c.kind))
    expect(editor.commit()).toEqual({ kind: 'unchanged' })
    q<HTMLButtonElement>('commit-script')?.click()
    expect(changes).toEqual([])
    expect(q('parse-error')?.hidden).toBe(true)
  })

  it('does not commit on blur', () => {
    const { store: s, textarea } = standalone()
    textarea.value = EDITED
    textarea.dispatchEvent(new FocusEvent('blur'))
    textarea.dispatchEvent(new Event('change'))
    expect(s.getCard('hello')?.script).not.toBe(EDITED)
  })

  it('commits a valid draft with the Commit button and stores it verbatim', () => {
    const { store: s, q, textarea } = standalone()
    // A <textarea> normalises \r\n to \n on input (design.md §7.4); the
    // commit takes textarea.value verbatim, trailing whitespace included.
    textarea.value = `${EDITED}\r\n  -- trailing  `
    const draft = textarea.value
    expect(draft).toBe(`${EDITED}\n  -- trailing  `)
    q<HTMLButtonElement>('commit-script')?.click()
    expect(s.getCard('hello')?.script).toBe(draft)
    expect(s.getCard('hello')?.scriptOrigin).toEqual({ kind: 'edited', at: NOW.toISOString() })
    expect(q('parse-error')?.hidden).toBe(true)
  })

  it('commits with Ctrl+Enter and with Cmd+Enter, not with plain Enter', () => {
    const { store: s, textarea } = standalone()
    textarea.value = EDITED
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(s.getCard('hello')?.script).not.toBe(EDITED)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(s.getCard('hello')?.script).toBe(EDITED)
    textarea.value = `${EDITED}\n`
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    expect(s.getCard('hello')?.script).toBe(`${EDITED}\n`)
  })

  it('shows the parse error next to the editor, selects the line and keeps the draft on failure', () => {
    const { store: s, editor, q, textarea } = standalone()
    const before = s.getCard('hello')?.script
    textarea.value = BROKEN
    expect(editor.commit()).toEqual({
      kind: 'rejected',
      error: { line: 3, column: 5, message: 'expected "end openCard", found "end mouseUp"', near: 'end mouseUp' },
    })
    expect(s.getCard('hello')?.script).toBe(before)
    expect(textarea.value).toBe(BROKEN)
    const panel = q('parse-error')
    expect(panel?.hidden).toBe(false)
    expect(panel?.textContent).toContain('Line 3, column 5: expected "end openCard", found "end mouseUp"')
    expect(panel?.querySelector('pre')?.textContent).toBe('end mouseUp')
    expect(textarea.dataset['errorLine']).toBe('3')
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('end mouseUp')
  })

  it('clears the error after a later successful commit', () => {
    const { editor, q, textarea } = standalone()
    textarea.value = BROKEN
    editor.commit()
    textarea.value = EDITED
    editor.commit()
    expect(q('parse-error')?.hidden).toBe(true)
    expect(textarea.dataset['errorLine']).toBeUndefined()
  })

  it('setDraft replaces the draft and clears the panel', () => {
    const { editor, q, textarea } = standalone()
    textarea.value = BROKEN
    editor.commit()
    editor.setDraft('')
    expect(textarea.value).toBe('')
    expect(q('parse-error')?.hidden).toBe(true)
  })
})

// Task 19.1, requirement 8.2.
describe('a Commit that storage refuses', () => {
  it('says the script was not saved, keeps the draft and leaves the stored script', () => {
    const storage = { full: true }
    const { store: s, editor, q, textarea } = standalone('hello', storage)
    const before = s.getCard('hello')
    textarea.value = EDITED
    expect(editor.commit()).toEqual({ kind: 'not-saved' })
    expect(q('commit-error')?.hidden).toBe(false)
    expect(q('commit-error')?.textContent).toBe(COMMIT_NOT_SAVED)
    expect(COMMIT_NOT_SAVED).toBe(
      "The script was not saved: the browser's storage is full or unavailable. The card still runs the stored script, and your draft is kept here.",
    )
    expect(q('commit-error')?.getAttribute('role')).toBe('alert')
    expect(q('parse-error')?.hidden).toBe(true)
    expect(textarea.value).toBe(EDITED)
    expect(s.getCard('hello')).toBe(before)
  })

  it('replaces a parse error that was showing, and is replaced by the next one', () => {
    const storage = { full: false }
    const { editor, q, textarea } = standalone('hello', storage)
    textarea.value = BROKEN
    editor.commit()
    storage.full = true
    textarea.value = EDITED
    editor.commit()
    expect(q('parse-error')?.hidden).toBe(true)
    expect(textarea.dataset['errorLine']).toBeUndefined()
    expect(q('commit-error')?.hidden).toBe(false)
    textarea.value = BROKEN
    expect(editor.commit().kind).toBe('rejected')
    expect(q('commit-error')?.hidden).toBe(true)
    expect(q('commit-error')?.textContent).toBe('')
    expect(q('parse-error')?.hidden).toBe(false)
  })

  it('goes away with a Commit that is stored, with an unchanged draft and with setDraft', () => {
    const storage = { full: true }
    const { store: s, editor, q, textarea } = standalone('hello', storage)
    const original = textarea.value
    textarea.value = EDITED
    editor.commit()
    textarea.value = original
    expect(editor.commit()).toEqual({ kind: 'unchanged' })
    expect(q('commit-error')?.hidden).toBe(true)

    textarea.value = EDITED
    editor.commit()
    expect(q('commit-error')?.hidden).toBe(false)
    editor.setDraft(original)
    expect(q('commit-error')?.hidden).toBe(true)

    textarea.value = EDITED
    editor.commit()
    storage.full = false
    expect(editor.commit()).toEqual({ kind: 'committed' })
    expect(q('commit-error')?.hidden).toBe(true)
    expect(s.getCard('hello')?.script).toBe(EDITED)
  })

  it('does not re-run the card: the front, the stored view and the running program stay', () => {
    const storage = { full: false }
    const { q, textarea, runtime, store: s } = inCard('hello', storage)
    const stored = s.getCard('hello')?.script
    const field = q<HTMLTextAreaElement>('field-greeting')
    if (field === null) throw new Error('no field')
    field.value = 'typed on the front'
    storage.full = true
    textarea.value = EDITED
    q<HTMLButtonElement>('commit-script')?.click()
    expect(q('commit-error')?.textContent).toBe(COMMIT_NOT_SAVED)
    expect(field.value).toBe('typed on the front')
    expect(q('stored-script')?.textContent).toBe(stored)
    expect(runtime.currentProgram('hello')?.source).toBe(stored)
    expect(q('script-origin')?.textContent).toBe('bundled example')
    expect(textarea.value).toBe(EDITED)
  })
})

describe('editor inside a card', () => {
  it('re-runs the card immediately on a successful commit and updates the stored view', () => {
    const { q, textarea, runtime } = inCard()
    textarea.value = EDITED
    q<HTMLButtonElement>('commit-script')?.click()
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, Kiro!')
    expect(q('stored-script')?.textContent).toBe(EDITED)
    expect(runtime.currentProgram('hello')?.source).toBe(EDITED)
  })

  it('keeps the last valid script running when the draft fails to parse', () => {
    const { q, textarea, runtime, store: s } = inCard()
    textarea.value = EDITED
    q<HTMLButtonElement>('commit-script')?.click()
    textarea.value = BROKEN
    q<HTMLButtonElement>('commit-script')?.click()
    expect(q('parse-error')?.hidden).toBe(false)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, Kiro!')
    expect(s.getCard('hello')?.script).toBe(EDITED)
    expect(runtime.currentProgram('hello')?.source).toBe(EDITED)
    expect(q('stored-script')?.textContent).toBe(EDITED)
  })

  it('keeps the draft across a flip to the front and back', () => {
    const { view, textarea } = inCard()
    textarea.value = 'draft in progress'
    view.flip()
    view.flip()
    expect(textarea.value).toBe('draft in progress')
  })

  it('mirrors the runtime status on the back face', () => {
    const { q, textarea } = inCard()
    textarea.value = 'on openCard\n  put field "nope" into x\nend openCard\n'
    q<HTMLButtonElement>('commit-script')?.click()
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(q('status-mirror')?.textContent).toBe('Runtime error in openCard, line 2: field "nope" does not exist')
        resolve()
      })
    })
  })
})
