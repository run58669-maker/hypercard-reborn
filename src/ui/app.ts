// The app shell (design.md §7.1): header with the card name, position,
// Previous / Next and Settings, one card at a time, run on show.
import type { CardRuntime } from '../runtime'
import type { Card, CardStore } from '../store'
import { createCardView, type CardView } from './cardView'
import { el } from './dom'

export interface AppDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
}

export interface App {
  readonly element: HTMLElement
  /** Shows card number n (1-based) and runs it. Out of range is ignored. */
  go(n: number): void
  current(): Card | undefined
}

export function createApp(root: HTMLElement, deps: AppDeps): App {
  const name = el('h2', { class: 'card-name', testid: 'card-name' })
  const position = el('p', { class: 'card-position', testid: 'card-position' })
  const prev = el('button', { testid: 'card-prev', text: 'Previous', title: 'Previous card' })
  const next = el('button', { testid: 'card-next', text: 'Next', title: 'Next card' })
  const settings = el('button', { testid: 'settings-open', text: 'Settings', title: 'Settings', disabled: true })
  const header = el('header', { class: 'app-header' }, [
    el('h1', { class: 'app-title', text: 'HyperCard Reborn' }),
    el('div', { class: 'card-heading' }, [name, position]),
    el('nav', { class: 'card-nav', ariaLabel: 'Cards' }, [prev, next, settings]),
  ])
  const stage = el('main', { class: 'stage' })
  const element = el('div', { class: 'app' }, [header, stage])
  root.replaceChildren(element)

  let view: CardView | null = null
  let number = 0

  // Scale the 512 px canvas down to fit narrow viewports (design.md §7.2).
  const rescale = (): void => {
    const available = stage.clientWidth - 28
    const scale = available > 0 ? Math.min(1, available / 512) : 1
    element.style.setProperty('--card-scale', String(scale))
  }
  window.addEventListener('resize', rescale)
  queueMicrotask(rescale)

  function go(n: number): void {
    const card = deps.store.getCardByNumber(n)
    if (card === undefined) return
    view?.dispose()
    number = n
    const count = deps.store.getCards().length
    name.textContent = card.name
    position.textContent = `Card ${String(n)} of ${String(count)}`
    prev.disabled = n <= 1
    next.disabled = n >= count
    view = createCardView(card, deps)
    stage.replaceChildren(view.element)
    view.show()
  }

  prev.addEventListener('click', () => {
    go(number - 1)
  })
  next.addEventListener('click', () => {
    go(number + 1)
  })

  return {
    element,
    go,
    current: () => view?.card,
  }
}
