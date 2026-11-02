// The back face (design.md §7.2): description on the left, script on the
// right. The read-only *Stored script* view is a <pre> whose textContent is
// `card.script` exactly: no innerHTML, no trim, no highlighter (§7.4). The
// editor (task 11) sits above it in the right column; the description panel
// (task 12) replaces the read-only description on the left.
import type { CardRuntime } from '../runtime'
import type { Card, CardStore, ScriptOrigin } from '../store'
import { el, setChildren } from './dom'
import { createEditor, type Editor } from './editor'

export interface BackFaceDeps {
  readonly store: CardStore
  readonly runtime: CardRuntime
}

export interface BackFace {
  readonly element: HTMLElement
  /** The left column, for the description panel (task 12.2). */
  readonly left: HTMLElement
  /** The right column: the editor, then the read-only stored view. */
  readonly right: HTMLElement
  readonly editor: Editor
  /** Renders the given card snapshot. */
  render(card: Card): void
  /** Mirrors the front-face status line (design.md §9). */
  setStatus(text: string): void
}

/** The script-origin line texts from design.md §7.2. */
export function originText(origin: ScriptOrigin): string {
  switch (origin.kind) {
    case 'seed':
      return 'bundled example'
    case 'edited':
      return `edited by hand at ${formatTime(origin.at)}`
    case 'compiled':
      return origin.provider === 'anthropic'
        ? `compiled from this description with Anthropic ${origin.model ?? ''} at ${formatTime(origin.at)}`.replace('  ', ' ')
        : `compiled offline at ${formatTime(origin.at)}`
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export interface BackFaceOptions {
  readonly cardId: string
  readonly now?: () => Date
}

export function createBackFace(deps: BackFaceDeps, options: BackFaceOptions): BackFace {
  const description = el('textarea', { class: 'description-input', testid: 'description-input', rows: 6, ariaLabel: 'Description' })
  description.readOnly = true
  const origin = el('p', { class: 'script-origin', testid: 'script-origin' })
  const left = el('div', { class: 'back-column back-description' }, [
    el('h3', { text: 'Description' }),
    description,
    origin,
  ])

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
    setStatus(text) {
      status.textContent = text
    },
    render(card) {
      description.value = card.description
      origin.textContent = originText(card.scriptOrigin)
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
