// One card, two faces (design.md §7.2). Both faces are always in the DOM;
// the Flip control toggles `data-face` and CSS does the 3-D transform, so
// flipping is instant and the running card is never torn down. Flipping
// back never re-runs the card (requirement 2.3).
import type { CardRuntime } from '../runtime'
import type { Card, CardStore } from '../store'
import { createBackFace, type BackFace } from './backFace'
import { el } from './dom'
import { createFrontFace } from './frontFace'

export interface CardViewDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
}

export type Face = 'front' | 'back'

export interface CardView {
  readonly element: HTMLElement
  readonly card: Card
  readonly back: BackFace
  /** Mounts the card into the runtime and runs it. Call after the element is in the document. */
  show(): void
  face(): Face
  flip(): void
  /** Tears the card down. */
  dispose(): void
}

export function createCardView(card: Card, deps: CardViewDeps): CardView {
  const front = createFrontFace()
  const back = createBackFace(deps)
  const flip = el('button', { class: 'flip', testid: 'flip', text: 'Flip', title: 'Flip the card' })
  const faces = el('div', { class: 'card-faces' }, [front.element, back.element])
  const element = el('article', { class: 'card', testid: 'card' }, [el('div', { class: 'card-toolbar' }, [flip]), faces])

  const latest = (): Card => deps.store.getCard(card.id) ?? card

  function setFace(face: Face): void {
    element.dataset['face'] = face
    front.element.setAttribute('aria-hidden', face === 'back' ? 'true' : 'false')
    back.element.setAttribute('aria-hidden', face === 'front' ? 'true' : 'false')
    flip.textContent = face === 'front' ? 'Flip' : 'Flip back'
  }
  setFace('front')

  // The view keeps the runtime and the back face in step with the store: a
  // committed script re-runs the card immediately (requirement 3.2) and the
  // back face is rendered from the same snapshot the runtime was given, so
  // the §7.4 assertion in backFace.render can never fire.
  const unsubscribe = deps.store.subscribe((change) => {
    if (change.kind === 'description' && change.id === card.id) {
      back.render(latest())
    } else if (change.kind === 'reset' || (change.kind === 'script' && change.id === card.id)) {
      const current = latest()
      deps.runtime.rerun(current)
      back.render(current)
    }
  })

  const view: CardView = {
    element,
    card,
    back,
    show() {
      deps.runtime.run(card, front.mount)
      back.render(latest())
    },
    face: () => (element.dataset['face'] === 'back' ? 'back' : 'front'),
    flip() {
      if (view.face() === 'front') {
        back.render(latest())
        setFace('back')
      } else {
        setFace('front')
      }
    },
    dispose() {
      unsubscribe()
      deps.runtime.unmount(card.id)
      element.remove()
    },
  }
  flip.addEventListener('click', () => {
    view.flip()
  })
  return view
}
