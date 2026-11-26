// One card, two faces (design.md §7.2). Both faces are always in the DOM;
// the Flip control toggles `data-face` and CSS does the 3-D transform, so
// flipping is instant and the running card is never torn down. Flipping
// back never re-runs the card (requirement 2.3).
import type { CardRuntime } from '../runtime'
import type { Card, CardStore } from '../store'
import { createBackFace, type BackFace } from './backFace'
import type { LoadCompiler } from './compiler'
import { el } from './dom'
import { createFrontFace } from './frontFace'
import type { ProviderChoice } from './settings'

export interface CardViewDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
  readonly provider: () => ProviderChoice
  readonly loadCompiler: LoadCompiler
  readonly now?: () => Date
  /** Mount the card without running its `openCard` and show its back (design.md §5.7). */
  readonly held?: boolean
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
  /** Re-renders the back face from the store (after a settings change). */
  refresh(): void
  /** Tears the card down. */
  dispose(): void
}

export function createCardView(card: Card, deps: CardViewDeps): CardView {
  const front = createFrontFace()
  const back = createBackFace(deps, { cardId: card.id, ...(deps.now === undefined ? {} : { now: deps.now }) })
  const flip = el('button', { class: 'flip', testid: 'flip', text: 'Flip', title: 'Flip the card' })
  const faces = el('div', { class: 'card-faces' }, [front.element, back.element])
  // Shown on the front face only (CSS hides it on the back): points a first-time visitor at Flip.
  const flipHint = el('span', { class: 'flip-hint', testid: 'flip-hint', text: 'The script is on the back →' })
  const element = el('article', { class: 'card', testid: 'card' }, [el('div', { class: 'card-toolbar' }, [flipHint, flip]), faces])

  const latest = (): Card => deps.store.getCard(card.id) ?? card

  // Mirror the front-face status line on the back face (design.md §9).
  const statusObserver = new MutationObserver(() => {
    back.setStatus(front.mount.statusLine.textContent ?? '')
  })
  statusObserver.observe(front.mount.statusLine, { childList: true, characterData: true, subtree: true })

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
      // A Save that compiled a new script resets the draft to it (design.md §8).
      if (current.scriptOrigin.kind !== 'edited') back.editor.setDraft(current.script)
      back.render(current)
    }
  })

  const view: CardView = {
    element,
    card,
    back,
    show() {
      if (deps.held === true) {
        deps.runtime.hold(card, front.mount)
        back.render(latest())
        setFace('back')
        return
      }
      deps.runtime.run(card, front.mount)
      back.render(latest())
    },
    face: () => (element.dataset['face'] === 'back' ? 'back' : 'front'),
    refresh() {
      back.render(latest())
    },
    flip() {
      if (view.face() === 'front') {
        back.render(latest())
        setFace('back')
      } else {
        setFace('front')
        // Requirement 5.6: move focus to the Flip button when the back face had focus.
        if (back.element.contains(document.activeElement)) {
          flip.focus()
        }
      }
    },
    dispose() {
      statusObserver.disconnect()
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
