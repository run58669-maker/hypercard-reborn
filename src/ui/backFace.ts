// The back face (design.md §7.2): the description panel on the left, the
// script on the right. The read-only *Stored script* view is a <pre> whose
// textContent is `card.script` exactly: no innerHTML, no trim, no
// highlighter (§7.4). The editor sits above it in the right column.
import type { CardRuntime } from '../runtime'
import type { Card, CardStore } from '../store'
import type { LoadCompiler } from './compiler'
import { createDescriptionPanel, type DescriptionPanel } from './descriptionPanel'
import { el, setChildren } from './dom'
import { createEditor, type Editor } from './editor'
import type { ProviderChoice } from './settings'

export { originText } from './descriptionPanel'

export interface BackFaceDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
  readonly provider: () => ProviderChoice
  readonly loadCompiler: LoadCompiler
}

export interface BackFace {
  readonly element: HTMLElement
  /** The left column, for the description panel (task 12.2). */
  readonly left: HTMLElement
  /** The right column: the editor, then the read-only stored view. */
  readonly right: HTMLElement
  readonly editor: Editor
  readonly description: DescriptionPanel
  /** Renders the given card snapshot. */
  render(card: Card): void
  /** Mirrors the front-face status line (design.md §9). */
  setStatus(text: string): void
}

export interface BackFaceOptions {
  readonly cardId: string
  readonly now?: () => Date
}

export function createBackFace(deps: BackFaceDeps, options: BackFaceOptions): BackFace {
  const description = createDescriptionPanel({
    store: deps.store,
    cardId: options.cardId,
    provider: deps.provider,
    loadCompiler: deps.loadCompiler,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  const left = el('div', { class: 'back-column back-description' }, [description.element])

  const editor = createEditor({ store: deps.store, cardId: options.cardId, ...(options.now === undefined ? {} : { now: options.now }) })
  const stored = el('pre', { class: 'stored-script', testid: 'stored-script', ariaLabel: 'Stored script' })
  const storedBlock = el('div', { class: 'stored-block' }, [el('h3', { text: 'Stored script' }), stored])
  const status = el('p', { class: 'status-line status-mirror', testid: 'status-mirror', ariaLabel: 'Runtime status' })
  const right = el('div', { class: 'back-column back-script' }, [editor.element, storedBlock, status])

  const element = el('section', { class: 'face face-back', testid: 'card-back', ariaLabel: 'Card back' }, [left, right])

  return {
    element,
    left,
    right,
    editor,
    description,
    setStatus(text) {
      status.textContent = text
    },
    render(card) {
      description.render(card)
      // The one string, read from the same snapshot the runtime was given.
      stored.textContent = card.script
      const program = deps.runtime.currentProgram(card.id)
      if (import.meta.env.DEV && program !== undefined && program.source !== card.script) {
        throw new Error(`back face and runtime disagree on the script of card "${card.id}"`)
      }
      setChildren(storedBlock, [el('h3', { text: 'Stored script' }), stored])
    },
  }
}
