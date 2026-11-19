// The front face (design.md §7.2): the 512 x 342 canvas the runtime renders
// the card's objects into, a status line for runtime errors, the message box
// and the dialog root.
import type { CardMount } from '../runtime'
import { el } from './dom'

export const CARD_WIDTH = 512
export const CARD_HEIGHT = 342

export interface FrontFace {
  readonly element: HTMLElement
  readonly mount: CardMount
}

export function createFrontFace(): FrontFace {
  const canvas = el('div', { class: 'card-canvas', testid: 'card-canvas' })
  const statusLine = el('p', { class: 'status-line', testid: 'status-line', ariaLabel: 'Runtime status' })
  const messageBox = el('p', { class: 'message-box', testid: 'message-box', ariaLabel: 'Message box' })
  const dialogRoot = el('div', { class: 'dialog-root' })
  const scaler = el('div', { class: 'card-scaler' }, [canvas])
  const element = el('section', { class: 'face face-front', testid: 'card-front', ariaLabel: 'Card front' }, [
    scaler,
    messageBox,
    statusLine,
    dialogRoot,
  ])
  return { element, mount: { canvas, statusLine, messageBox, dialogRoot } }
}
