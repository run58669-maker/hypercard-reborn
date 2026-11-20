// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// Listeners added to `document` and `window` by createApp, collected so afterEach
// can remove them all and prevent leakage between tests.
type EventEntry = { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; options: boolean | AddEventListenerOptions | undefined }
let captured: EventEntry[] = []

beforeEach(() => {
  captured = []
  const origDoc = document.addEventListener.bind(document)
  const origWin = window.addEventListener.bind(window)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options?) => {
    captured.push({ target: document, type, listener, options })
    origDoc(type, listener, options)
  })
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options?) => {
    captured.push({ target: window, type, listener, options })
    origWin(type, listener, options)
  })
})

afterEach(() => {
  for (const { target, type, listener, options } of captured) {
    target.removeEventListener(type, listener, options)
  }
  captured = []
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

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
    loadCompiler: () => Promise.reject(new Error('compiler not loaded in this test')),
  })
  app.go(1)

  const q = <T extends HTMLElement>(testid: string) =>
    root.querySelector<T>(`[data-testid="${testid}"]`)

  // Dispatch from document.body with cancelable: true so defaultPrevented guards are exercised.
  function fire(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
    document.body.dispatchEvent(event)
    return event
  }

  return { store, runtime, app, root, q, fire }
}

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
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
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

  // --- New tests for task 16.3 ---

  it('defaultPrevented guard: a pre-cancelled ArrowRight does not change card', () => {
    const { q } = setup()
    // Attach a listener that calls preventDefault() before the app's listener fires.
    const preCancel = (event: Event): void => { event.preventDefault() }
    document.body.addEventListener('keydown', preCancel, { capture: true })
    try {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
    } finally {
      document.body.removeEventListener('keydown', preCancel, { capture: true })
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('handled ArrowRight sets defaultPrevented on the event', () => {
    const { fire } = setup()
    const event = fire('ArrowRight')
    expect(event.defaultPrevented).toBe(true)
  })

  it('handled Escape from the back face sets defaultPrevented on the event', () => {
    const { q, fire } = setup()
    q<HTMLButtonElement>('flip')?.click()
    const event = fire('Escape')
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['altKey', { altKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
  ] as const)('arrow key with %s held does not change card', (_modifier, options) => {
    const { q, fire } = setup()
    fire('ArrowRight', options)
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('ArrowRight from an input element does not change card', () => {
    const { q } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    } finally {
      input.remove()
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('ArrowRight from a select element does not change card', () => {
    const { q } = setup()
    const select = document.createElement('select')
    document.body.appendChild(select)
    try {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    } finally {
      select.remove()
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('ArrowRight from inside a contenteditable element does not change card', () => {
    const { q } = setup()
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    const span = document.createElement('span')
    div.appendChild(span)
    document.body.appendChild(div)
    try {
      span.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    } finally {
      div.remove()
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('answer-dialog guard: ArrowRight does not change card when dialog is present', () => {
    const { q } = setup()
    const dialog = document.createElement('div')
    dialog.dataset['testid'] = 'answer-dialog'
    document.body.appendChild(dialog)
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    } finally {
      dialog.remove()
    }
    expect(q('card-position')?.textContent).toBe('Card 1 of 6')
  })

  it('answer-dialog guard: Escape leaves the back face showing when dialog is present', () => {
    const { q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    const dialog = document.createElement('div')
    dialog.dataset['testid'] = 'answer-dialog'
    document.body.appendChild(dialog)
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    } finally {
      dialog.remove()
    }
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
  })

  it('settings panel guard: Escape leaves back face showing when settings panel is open', () => {
    const { q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    // Click the settings-open button: this calls settings.open() -> showModal() or setAttribute('open','')
    q<HTMLButtonElement>('settings-open')?.click()
    // Confirm the panel has open (jsdom sets it via showModal or setAttribute fallback)
    const panel = document.querySelector<HTMLDialogElement>('[data-testid="settings-panel"]')
    expect(panel?.hasAttribute('open')).toBe(true)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
  })

  it('Escape with Ctrl held leaves back face showing', () => {
    const { q, fire } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    fire('Escape', { ctrlKey: true })
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
  })

  it('Escape from script-editor flips to front without re-running the card', () => {
    const { q, runtime } = setup()
    // Spy on rerun to assert it is never called.
    const rerunSpy = vi.spyOn(runtime, 'rerun')
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    const editor = q<HTMLTextAreaElement>('script-editor')
    expect(editor).not.toBeNull()
    if (editor !== null) {
      // Simulate a draft edit without committing.
      editor.value = 'on openCard\nend openCard'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      // Dispatch Escape from the editor itself.
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }
    // Card should have flipped to front.
    expect(q('card-front')?.getAttribute('aria-hidden')).toBe('false')
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('true')
    // rerun must not have been called by the Escape.
    expect(rerunSpy).not.toHaveBeenCalled()
    rerunSpy.mockRestore()
  })

  it('ArrowLeft on card 1 does not call preventDefault', () => {
    const { fire } = setup()
    const event = fire('ArrowLeft')
    expect(event.defaultPrevented).toBe(false)
  })

  it('ArrowRight on card 6 does not call preventDefault', () => {
    const { app, fire } = setup()
    app.go(6)
    const event = fire('ArrowRight')
    expect(event.defaultPrevented).toBe(false)
  })

  it('Escape with isComposing: true leaves the back face showing', () => {
    const { q, fire } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    fire('Escape', { isComposing: true })
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
  })

  it('Escape with keyCode 229 leaves the back face showing', () => {
    const { q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
    const event = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('false')
  })

  it('Escape from script-editor moves focus to the flip button', () => {
    const { q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    const editor = q<HTMLTextAreaElement>('script-editor')
    expect(editor).not.toBeNull()
    editor?.focus()
    editor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    // After flipping to front, focus should be on the flip button.
    expect(document.activeElement).toBe(q<HTMLButtonElement>('flip'))
  })

  it('Escape from script-editor with a typed draft keeps the draft and focuses flip', () => {
    const { q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    const editor = q<HTMLTextAreaElement>('script-editor')
    if (editor !== null) {
      editor.value = 'on mouseUp\nend mouseUp'
      editor.focus()
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }
    expect(document.activeElement).toBe(q<HTMLButtonElement>('flip'))
    expect(q<HTMLTextAreaElement>('script-editor')?.value).toBe('on mouseUp\nend mouseUp')
  })
})