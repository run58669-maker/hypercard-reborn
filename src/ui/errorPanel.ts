// A panel for a ParseError (design.md §8, §9): line and column, the message
// verbatim, and the offending source line. Text only, never innerHTML.
import type { ParseError } from '../parser'
import { el, setChildren } from './dom'

export interface ErrorPanel {
  readonly element: HTMLElement
  show(error: ParseError): void
  clear(): void
  visible(): boolean
}

export function createErrorPanel(testid: string, label: string): ErrorPanel {
  const element = el('div', { class: 'error-panel', testid, hidden: true, ariaLabel: label })
  element.setAttribute('role', 'alert')
  return {
    element,
    show(error) {
      setChildren(element, [
        el('p', { class: 'error-position', text: `Line ${String(error.line)}, column ${String(error.column)}: ${error.message}` }),
        error.near === '' ? null : el('pre', { class: 'error-near', text: error.near }),
      ])
      element.hidden = false
    },
    clear() {
      element.replaceChildren()
      element.hidden = true
    },
    visible: () => !element.hidden,
  }
}
