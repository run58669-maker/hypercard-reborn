// In-memory Host for tests (design.md §5.1): objects in a Map keyed by kind
// and lower-cased name, every call recorded in order, dialogs, messages and
// navigations collected, and a fixed clock.
import type { Host, HostObject, ObjectKind } from './host'

export interface HostCall {
  readonly method: keyof Host
  readonly args: readonly unknown[]
}

interface LiveObject {
  readonly kind: ObjectKind
  name: string
  visible: boolean
  enabled: boolean
  text: string
}

function key(kind: ObjectKind, name: string): string {
  return `${kind}:${name.toLowerCase()}`
}

export class FakeHost implements Host {
  readonly calls: HostCall[] = []
  readonly dialogs: string[] = []
  readonly messages: string[] = []
  readonly navigations: number[] = []
  private readonly objects = new Map<string, LiveObject>()

  constructor(
    objects: readonly HostObject[],
    private readonly clock: Date,
    private readonly cardCount = 6,
  ) {
    for (const object of objects) {
      this.objects.set(key(object.kind, object.name), {
        kind: object.kind,
        name: object.name,
        visible: object.visible,
        enabled: object.enabled ?? true,
        text: object.text ?? '',
      })
    }
  }

  /** The live object, for assertions. */
  object(kind: ObjectKind, name: string): Readonly<LiveObject> | undefined {
    return this.objects.get(key(kind, name))
  }

  private record(method: keyof Host, ...args: unknown[]): void {
    this.calls.push({ method, args })
  }

  hasObject(kind: ObjectKind, name: string): boolean {
    this.record('hasObject', kind, name)
    return this.objects.has(key(kind, name))
  }

  getFieldText(name: string): string | undefined {
    this.record('getFieldText', name)
    return this.objects.get(key('field', name))?.text
  }

  setFieldText(name: string, text: string): boolean {
    this.record('setFieldText', name, text)
    const field = this.objects.get(key('field', name))
    if (field === undefined) return false
    field.text = text
    return true
  }

  getName(kind: ObjectKind, name: string): string | undefined {
    this.record('getName', kind, name)
    return this.objects.get(key(kind, name))?.name
  }

  setVisible(kind: ObjectKind, name: string, visible: boolean): boolean {
    this.record('setVisible', kind, name, visible)
    const object = this.objects.get(key(kind, name))
    if (object === undefined) return false
    object.visible = visible
    return true
  }

  setEnabled(name: string, enabled: boolean): boolean {
    this.record('setEnabled', name, enabled)
    const button = this.objects.get(key('button', name))
    if (button === undefined) return false
    button.enabled = enabled
    return true
  }

  setName(kind: ObjectKind, name: string, newName: string): boolean {
    this.record('setName', kind, name, newName)
    const object = this.objects.get(key(kind, name))
    if (object === undefined) return false
    this.objects.delete(key(kind, name))
    object.name = newName
    this.objects.set(key(kind, newName), object)
    return true
  }

  answer(message: string): void {
    this.record('answer', message)
    this.dialogs.push(message)
  }

  message(text: string): void {
    this.record('message', text)
    this.messages.push(text)
  }

  goToCard(n: number): boolean {
    this.record('goToCard', n)
    if (!Number.isInteger(n) || n < 1 || n > this.cardCount) return false
    this.navigations.push(n)
    return true
  }

  now(): Date {
    this.record('now')
    return this.clock
  }
}
