// A Host over a container element (design.md §5.5, §7.2): renders the card's
// objects as positioned <textarea> fields and <button> buttons, reads field
// text live from the DOM, queues answer dialogs and remembers at most one
// goToCard request for the runtime to act on after the handler returns.
import type { Host, ObjectKind } from '../interpreter'
import type { CardObject } from '../store'

export interface DomHostOptions {
  /** Number of cards in the stack, for `goToCard` range checks. */
  readonly cardCount: number
  /** Receives the clicked button's current name. */
  readonly onButtonClick: (name: string) => void
  /** The message box element; `message()` writes its text. */
  readonly messageBox: HTMLElement
  /** Injectable clock. */
  readonly now?: () => Date
}

interface LiveObject {
  readonly kind: ObjectKind
  name: string
  readonly element: HTMLTextAreaElement | HTMLButtonElement
}

/** `data-testid` suffix for an object name: lower-cased, spaces to `-`. */
export function testIdFor(kind: ObjectKind, name: string): string {
  return `${kind}-${name.toLowerCase().replace(/ /g, '-')}`
}

export class DomHost implements Host {
  /** Dialogs queued by `answer`, in order; the runtime drains them. */
  readonly pendingDialogs: string[] = []
  /** The last `goToCard` request, if any. */
  pendingNavigation: number | null = null
  /** While true, button clicks are ignored (a dialog is open). */
  inert = false

  private readonly objects: LiveObject[] = []
  private readonly clock: () => Date

  constructor(
    private readonly container: HTMLElement,
    objects: readonly CardObject[],
    private readonly options: DomHostOptions,
  ) {
    this.clock = options.now ?? (() => new Date())
    container.replaceChildren()
    for (const object of objects) this.objects.push(this.render(object))
  }

  private render(object: CardObject): LiveObject {
    const doc = this.container.ownerDocument
    let element: HTMLTextAreaElement | HTMLButtonElement
    if (object.kind === 'field') {
      const field = doc.createElement('textarea')
      field.value = object.text ?? ''
      field.setAttribute('aria-label', object.name)
      element = field
    } else {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = object.name
      button.disabled = object.enabled === false
      button.addEventListener('click', () => {
        if (this.inert || button.disabled) return
        const live = this.objects.find((o) => o.element === button)
        if (live !== undefined) this.options.onButtonClick(live.name)
      })
      element = button
    }
    element.className = `card-object card-${object.kind}`
    element.dataset['testid'] = testIdFor(object.kind, object.name)
    element.hidden = !object.visible
    element.style.left = `${String(object.rect.x)}px`
    element.style.top = `${String(object.rect.y)}px`
    element.style.width = `${String(object.rect.w)}px`
    element.style.height = `${String(object.rect.h)}px`
    this.container.append(element)
    return { kind: object.kind, name: object.name, element }
  }

  private find(kind: ObjectKind, name: string): LiveObject | undefined {
    const lower = name.toLowerCase()
    return this.objects.find((o) => o.kind === kind && o.name.toLowerCase() === lower)
  }

  /** The element for an object, for the runtime and tests. */
  element(kind: ObjectKind, name: string): HTMLElement | undefined {
    return this.find(kind, name)?.element
  }

  hasObject(kind: ObjectKind, name: string): boolean {
    return this.find(kind, name) !== undefined
  }

  getFieldText(name: string): string | undefined {
    const field = this.find('field', name)
    return field === undefined ? undefined : (field.element as HTMLTextAreaElement).value
  }

  setFieldText(name: string, text: string): boolean {
    const field = this.find('field', name)
    if (field === undefined) return false
    ;(field.element as HTMLTextAreaElement).value = text
    return true
  }

  getName(kind: ObjectKind, name: string): string | undefined {
    return this.find(kind, name)?.name
  }

  setVisible(kind: ObjectKind, name: string, visible: boolean): boolean {
    const object = this.find(kind, name)
    if (object === undefined) return false
    object.element.hidden = !visible
    return true
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const button = this.find('button', name)
    if (button === undefined) return false
    ;(button.element as HTMLButtonElement).disabled = !enabled
    return true
  }

  setName(kind: ObjectKind, name: string, newName: string): boolean {
    const object = this.find(kind, name)
    if (object === undefined) return false
    object.name = newName
    object.element.dataset['testid'] = testIdFor(kind, newName)
    if (kind === 'button') object.element.textContent = newName
    else object.element.setAttribute('aria-label', newName)
    return true
  }

  answer(message: string): void {
    this.pendingDialogs.push(message)
  }

  message(text: string): void {
    this.options.messageBox.textContent = text
  }

  goToCard(n: number): boolean {
    if (!Number.isInteger(n) || n < 1 || n > this.options.cardCount) return false
    this.pendingNavigation = n
    return true
  }

  now(): Date {
    return this.clock()
  }

  /** Removes every rendered element. */
  dispose(): void {
    this.container.replaceChildren()
    this.objects.length = 0
  }
}
