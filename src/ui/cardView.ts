// One card, two faces (design.md §7.2). The front face is mounted into the
// runtime when the view is shown; the Flip control toggles `data-face`.
// Task 9.4 ships the front face; task 10 adds the back face and the flip.
import type { CardRuntime } from '../runtime'
import type { Card, CardStore } from '../store'
import { el } from './dom'
import { createFrontFace } from './frontFace'

export interface CardViewDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
}

export interface CardView {
  readonly element: HTMLElement
  readonly card: Card
  /** Mounts the card into the runtime and runs it. Call after the element is in the document. */
  show(): void
  /** Tears the card down. */
  dispose(): void
}

export function createCardView(card: Card, deps: CardViewDeps): CardView {
  const front = createFrontFace()
  const flip = el('button', { class: 'flip', testid: 'flip', text: 'Flip', title: 'Show the description and the script' })
  const faces = el('div', { class: 'card-faces' }, [front.element])
  const element = el('article', { class: 'card', testid: 'card' }, [el('div', { class: 'card-toolbar' }, [flip]), faces])
  element.dataset['face'] = 'front'

  return {
    element,
    card,
    show() {
      deps.runtime.run(card, front.mount)
    },
    dispose() {
      deps.runtime.unmount(card.id)
      element.remove()
    },
  }
}
