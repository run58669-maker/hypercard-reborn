// Small DOM render helpers (tech.md: plain DOM, no framework).

type Child = Node | string | null | undefined | false

export interface Attrs {
  readonly class?: string
  readonly testid?: string
  readonly text?: string
  readonly type?: string
  readonly title?: string
  readonly disabled?: boolean
  readonly hidden?: boolean
  readonly for?: string
  readonly id?: string
  readonly name?: string
  readonly value?: string
  readonly checked?: boolean
  readonly placeholder?: string
  readonly rows?: number
  readonly spellcheck?: boolean
  readonly ariaLabel?: string
  readonly href?: string
}

/** Creates an element with attributes and children; text is set with textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: readonly Child[] = []): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (attrs.class !== undefined) element.className = attrs.class
  if (attrs.testid !== undefined) element.dataset['testid'] = attrs.testid
  if (attrs.text !== undefined) element.textContent = attrs.text
  if (attrs.title !== undefined) element.title = attrs.title
  if (attrs.id !== undefined) element.id = attrs.id
  if (attrs.hidden === true) element.hidden = true
  if (attrs.ariaLabel !== undefined) element.setAttribute('aria-label', attrs.ariaLabel)
  if (attrs.spellcheck !== undefined) element.spellcheck = attrs.spellcheck
  if (element instanceof HTMLButtonElement) {
    element.type = attrs.type === 'submit' || attrs.type === 'reset' ? attrs.type : 'button'
    if (attrs.disabled === true) element.disabled = true
  }
  if (element instanceof HTMLInputElement) {
    if (attrs.type !== undefined) element.type = attrs.type
    if (attrs.name !== undefined) element.name = attrs.name
    if (attrs.value !== undefined) element.value = attrs.value
    if (attrs.checked !== undefined) element.checked = attrs.checked
    if (attrs.placeholder !== undefined) element.placeholder = attrs.placeholder
    if (attrs.disabled === true) element.disabled = true
  }
  if (element instanceof HTMLTextAreaElement) {
    if (attrs.value !== undefined) element.value = attrs.value
    if (attrs.rows !== undefined) element.rows = attrs.rows
    if (attrs.placeholder !== undefined) element.placeholder = attrs.placeholder
  }
  if (element instanceof HTMLLabelElement && attrs.for !== undefined) element.htmlFor = attrs.for
  if (element instanceof HTMLAnchorElement && attrs.href !== undefined) element.href = attrs.href
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    element.append(child)
  }
  return element
}

/** Replaces an element's children. */
export function setChildren(parent: HTMLElement, children: readonly Child[]): void {
  parent.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false))
}
