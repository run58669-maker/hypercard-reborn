// The Host interface (design.md §5.1): every side effect of a running script
// goes through it, so the interpreter is testable with FakeHost and the
// runtime supplies a DOM-backed one.

export type ObjectKind = 'field' | 'button'

/**
 * What a host needs to know about a card object to seed its live state. The
 * store's CardObject satisfies this structurally (it adds `rect`).
 */
export interface HostObject {
  readonly kind: ObjectKind
  readonly name: string
  readonly visible: boolean
  /** Buttons only; default true. */
  readonly enabled?: boolean
  /** Fields only; default ''. */
  readonly text?: string
}

export interface Host {
  /** Case-insensitive, against current (possibly renamed) names. */
  hasObject(kind: ObjectKind, name: string): boolean
  /** `undefined` = no such field. */
  getFieldText(name: string): string | undefined
  /** `false` = no such field. */
  setFieldText(name: string, text: string): boolean
  /** The current name of the object, or `undefined` if there is none. */
  getName(kind: ObjectKind, name: string): string | undefined
  setVisible(kind: ObjectKind, name: string, visible: boolean): boolean
  /** Buttons only. */
  setEnabled(name: string, enabled: boolean): boolean
  setName(kind: ObjectKind, name: string, newName: string): boolean
  /** Queued modal dialog; the interpreter does not await it. */
  answer(message: string): void
  /** The message box / toast. */
  message(text: string): void
  /** `false` = out of range. The runtime acts on it after the handler ends. */
  goToCard(n: number): boolean
  /** Injectable clock for `the date` / `the time`. */
  now(): Date
}
