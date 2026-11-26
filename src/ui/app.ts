// The app shell (design.md §7.1): header with the card name, position,
// Previous / Next and Settings, one card at a time, run on show.
import type { CardRuntime } from '../runtime'
import type { Card, CardStore, StorageLike } from '../store'
import { createCardView, type CardView } from './cardView'
import { lazyCompiler, type LoadCompiler } from './compiler'
import { el } from './dom'
import { createSettings } from './settings'

export interface AppDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
  /** localStorage in the app; a fake in tests. */
  readonly storage: StorageLike
  readonly confirm?: (message: string) => boolean
  readonly now?: () => Date
  /** Defaults to a dynamic import() of src/compile; tests inject a fake. */
  readonly loadCompiler?: LoadCompiler
}

export interface App {
  readonly element: HTMLElement
  /**
   * Shows card number n (1-based) and runs it. Out of range is ignored.
   * `sentOnBy` is given when a script asked for the move: the ids of the cards
   * whose `openCard` moved the stack on (design.md §5.7). Without it the move
   * is the user's.
   */
  go(n: number, sentOnBy?: readonly string[]): void
  current(): Card | undefined
}

/** The text in front of the buttons of the notice (requirement 7.8). */
export const MOVED_NOTICE =
  'An openCard script sent the stack on to this card. To change that script, open its card without running openCard: '

export function createApp(root: HTMLElement, deps: AppDeps): App {
  const name = el('h2', { class: 'card-name', testid: 'card-name' })
  const position = el('p', { class: 'card-position', testid: 'card-position' })
  const prev = el('button', { testid: 'card-prev', text: 'Previous', title: 'Previous card' })
  const next = el('button', { testid: 'card-next', text: 'Next', title: 'Next card' })
  const settingsOpen = el('button', { testid: 'settings-open', text: 'Settings', title: 'Settings' })
  const settings = createSettings({
    store: deps.store,
    storage: deps.storage,
    ...(deps.confirm === undefined ? {} : { confirm: deps.confirm }),
    onProviderChange: () => view?.refresh(),
  })
  const loadCompiler = deps.loadCompiler ?? lazyCompiler(deps.storage)
  const header = el('header', { class: 'app-header' }, [
    el('h1', { class: 'app-title', text: 'HyperCard Reborn' }),
    el('div', { class: 'card-heading' }, [name, position]),
    el('nav', { class: 'card-nav', ariaLabel: 'Cards' }, [prev, next, settingsOpen]),
  ])
  // One sentence for a first-time visitor: what this is and where to click.
  const intro = el('p', {
    class: 'app-intro',
    testid: 'app-intro',
    text: 'HyperCard, 1987: every card carries its own script. Press Flip to read the script on the back of this card, or describe what the card should do in plain English and it rewrites itself.',
  })
  // Names the cards whose openCard moved the stack on, each with a way to open it anyway (§5.7).
  const movedNotice = el('p', { class: 'moved-notice', testid: 'moved-notice' })
  movedNotice.hidden = true
  const stage = el('main', { class: 'stage' })
  const element = el('div', { class: 'app' }, [header, intro, movedNotice, stage, settings.element])
  settingsOpen.addEventListener('click', () => {
    settings.open()
  })
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

  function showMoved(sentOnBy: readonly string[], showing: string): void {
    const cards = deps.store.getCards()
    const buttons: HTMLElement[] = []
    for (const id of sentOnBy) {
      const index = cards.findIndex((card) => card.id === id)
      const sender = cards[index]
      // The card that is showing can be flipped as it is.
      if (sender === undefined || id === showing) continue
      const button = el('button', {
        testid: `open-held-${String(index + 1)}`,
        text: `Card ${String(index + 1)}: ${sender.name}`,
        title: `Open card ${String(index + 1)} without running its openCard handler`,
      })
      button.addEventListener('click', () => {
        show(index + 1, [], true)
      })
      buttons.push(button)
    }
    movedNotice.hidden = buttons.length === 0
    movedNotice.replaceChildren(
      ...(buttons.length === 0
        ? []
        : [MOVED_NOTICE, ...buttons]),
    )
  }

  function go(n: number, sentOnBy: readonly string[] = []): void {
    show(n, sentOnBy, false)
  }

  function show(n: number, sentOnBy: readonly string[], held: boolean): void {
    const card = deps.store.getCardByNumber(n)
    if (card === undefined) return
    showMoved(sentOnBy, card.id)
    view?.dispose()
    number = n
    const count = deps.store.getCards().length
    name.textContent = card.name
    position.textContent = `Card ${String(n)} of ${String(count)}`
    prev.disabled = n <= 1
    next.disabled = n >= count
    view = createCardView(card, {
      store: deps.store,
      runtime: deps.runtime,
      provider: () => settings.provider(),
      loadCompiler,
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(held ? { held: true } : {}),
    })
    stage.replaceChildren(view.element)
    view.show()
  }

  prev.addEventListener('click', () => {
    go(number - 1)
  })
  next.addEventListener('click', () => {
    go(number + 1)
  })

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    // Global guards: already handled, modifier held, settings open, answer dialog present.
    if (event.defaultPrevented) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (settings.element.open) return
    if (document.querySelector('[data-testid="answer-dialog"]') !== null) return
    // IME guard (requirement 5.7): ignore keys consumed by input methods.
    if (event.isComposing || event.keyCode === 229) return

    const key = event.key
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      // Arrow-only guards: editable target or on the back face.
      const target = event.target
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return
      if (target instanceof Element && target.closest('[contenteditable]') !== null) return
      if (view?.face() === 'back') return
      const nextNumber = key === 'ArrowRight' ? number + 1 : number - 1
      if (deps.store.getCardByNumber(nextNumber) !== undefined) {
        event.preventDefault()
        go(nextNumber)
      }
      // No preventDefault when no neighbouring card (requirement 5.1/5.2: "does nothing").
    } else if (key === 'Escape') {
      if (view?.face() === 'back') {
        event.preventDefault()
        view.flip()
      }
    }
  })

  return {
    element,
    go,
    current: () => view?.card,
  }
}
