// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { createApp } from './app'

const NOW = new Date(2026, 10, 1, 15, 4)

function fakeStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

function setup() {
  const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
  const runtime = createCardRuntime({ cardCount: () => store.getCards().length, onNavigate: (n) => { app.go(n) }, now: () => NOW })
  const storage = fakeStorage()
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const app = createApp(root, {
    store,
    runtime,
    storage,
    now: () => NOW,
    // Inject a no-op compiler so no dynamic import fires in tests.
    loadCompiler: () => Promise.reject(new Error('compiler not loaded in this test')),
  })
  app.go(1)

  const q = <T extends HTMLElement>(testid: string) =>
    root.querySelector<T>(`[data-testid="${testid}"]`)

  function fire(key: string, options: KeyboardEventInit = {}) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
  }

  return { store, runtime, app, root, q, fire }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createApp keyboard handler', () => {
  it('ArrowRight from card 1 goes to Card 2 of 6', () => {
    const { q, fire } = setup()
    fire('ArrowRight')
    expect(q('card-position')?.textContent).toBe('Card 2 of 6')
  })

  it('ArrowLeft on card 1 stays put', () => {
    const { q, fire } = setup()
    fire('ArrowLeft')
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('ArrowRight on card 6 stays put', () => {
    const { app, q, fire } = setup()
    app.go(6)
    fire('ArrowRight')
    expect(q('card-position')?.textContent).toBe('Card 6 of 6')
  })

  it('arrow key in a textarea does not change card', () => {
    const { q } = setup()
    // A field on card 1 is a textarea; dispatch the arrow key from it
    // (bubbles up to document, so the listener receives target = textarea).
    const textarea = q<HTMLTextAreaElement>('field-greeting')
    expect(textarea).not.toBeNull()
    if (textarea !== null) {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('arrow key while Shift held does not change card', () => {
    const { q, fire } = setup()
    fire('ArrowRight', { shiftKey: true })
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('arrow key on the back face does not change card', () => {
    const { q, fire } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
    fire('ArrowRight')
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('arrow key while settings panel is open does not change card', () => {
    const { root, q, fire } = setup()
    // Open the settings panel.
    q<HTMLButtonElement>('settings-open')?.click()
    // settings.element is the dialog; check it got open attribute.
    const panel = root.querySelector<HTMLDialogElement>('[data-testid="settings-panel"]')
    // In jsdom showModal sets the open attribute (or we set it manually in settings.ts).
    if (panel !== null) panel.setAttribute('open', '')
    fire('ArrowRight')
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('Escape on the back face flips to front with draft unchanged', () => {
    const { q, fire } = setup()
    // Flip to back.
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    // Type into the script editor so there is a draft in progress.
    const editor = q<HTMLTextAreaElement>('script-editor')
    if (editor !== null) editor.value = 'draft in progress'
    // Press Escape.
    fire('Escape')
    // Should be back on the front face.
    expect(q('card-front')?.getAttribute('aria-hidden')).toBe('false')
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('true')
    // Draft must be intact.
    expect(q<HTMLTextAreaElement>('script-editor')?.value).toBe('draft in progress')
  })

  it('Escape on the front face does nothing', () => {
    const { q, fire } = setup()
    expect(q('card-front')?.getAttribute('aria-hidden')).toBe('false')
    fire('Escape')
    // Still on the front face.
    expect(q('card-front')?.getAttribute('aria-hidden')).toBe('false')
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })
})
