// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createCardRuntime } from '../runtime'
import { createCardStore, seedCards } from '../store'
import { originText } from './backFace'
import { createCardView } from './cardView'

const NOW = new Date(2026, 10, 1, 15, 4)

function setup(id = 'hello') {
  const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
  const runtime = createCardRuntime({ cardCount: () => 6, onNavigate: () => undefined, now: () => NOW })
  const card = store.getCard(id)
  if (card === undefined) throw new Error(`no card ${id}`)
  const view = createCardView(card, { store, runtime })
  document.body.replaceChildren(view.element)
  view.show()
  const q = <T extends HTMLElement>(testid: string) => view.element.querySelector<T>(`[data-testid="${testid}"]`)
  return { store, runtime, card, view, q }
}

describe('createCardView', () => {
  it('mounts both faces, front first', () => {
    const { view, q } = setup()
    expect(view.element.dataset['face']).toBe('front')
    expect(q('card-front')).not.toBeNull()
    expect(q('card-back')).not.toBeNull()
    expect(q('card-back')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('flips to the back and the stored script textContent === card.script', () => {
    const { view, card, q } = setup()
    q<HTMLButtonElement>('flip')?.click()
    expect(view.element.dataset['face']).toBe('back')
    expect(view.face()).toBe('back')
    expect(q('stored-script')?.textContent).toBe(card.script)
    expect(q<HTMLTextAreaElement>('description-input')?.value).toBe(card.description)
    expect(q('script-origin')?.textContent).toBe('bundled example')
  })

  it('flips back to the front without re-running the card', () => {
    const { view, q, runtime } = setup('counter')
    q<HTMLButtonElement>('button-increment')?.click()
    q<HTMLButtonElement>('button-increment')?.click()
    expect(q<HTMLTextAreaElement>('field-count')?.value).toBe('2')
    const program = runtime.currentProgram('counter')
    view.flip()
    view.flip()
    expect(view.face()).toBe('front')
    expect(q<HTMLTextAreaElement>('field-count')?.value).toBe('2')
    expect(runtime.currentProgram('counter')).toBe(program)
  })

  it('re-runs the card on a committed script and shows it on the back face byte for byte, with its origin', () => {
    const { store, q, runtime } = setup()
    const script = 'on openCard\r\n  put "x" into field "greeting"  \r\nend openCard'
    store.commitScript('hello', script, { kind: 'edited', at: NOW.toISOString() })
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('x')
    expect(runtime.currentProgram('hello')?.source).toBe(script)
    q<HTMLButtonElement>('flip')?.click()
    expect(q('stored-script')?.textContent).toBe(script)
    expect(q('script-origin')?.textContent).toMatch(/^edited by hand at /)
  })

  it('re-renders the description without re-running the card', () => {
    const { store, q, runtime } = setup('counter')
    q<HTMLButtonElement>('button-increment')?.click()
    store.saveDescription('counter', 'new words')
    expect(q<HTMLTextAreaElement>('field-count')?.value).toBe('1')
    expect(q<HTMLTextAreaElement>('description-input')?.value).toBe('new words')
    expect(runtime.currentProgram('counter')?.source).toBe(store.getCard('counter')?.script)
  })

  it('dispose unmounts the runtime and removes the element', () => {
    const { view, runtime } = setup()
    view.dispose()
    expect(runtime.currentProgram('hello')).toBeUndefined()
    expect(document.body.children).toHaveLength(0)
  })
})

describe('originText', () => {
  it.each([
    [{ kind: 'seed' } as const, 'bundled example'],
    [{ kind: 'compiled', provider: 'canned', descriptionHash: 'h', at: 'bad date' } as const, 'compiled offline at bad date'],
    [{ kind: 'compiled', provider: 'anthropic', model: 'claude-haiku-5-5', descriptionHash: 'h', at: 'bad date' } as const, 'compiled from this description with Anthropic claude-haiku-5-5 at bad date'],
    [{ kind: 'edited', at: 'bad date' } as const, 'edited by hand at bad date'],
  ])('%o', (origin, expected) => {
    expect(originText(origin)).toBe(expected)
  })
})
