// The bundled example records (design.md §2, §3.2). `ExampleObject` has the
// same shape as the store's CardObject; the store seeds cards from these.

export interface ExampleObject {
  readonly kind: 'field' | 'button'
  readonly name: string
  readonly visible: boolean
  /** Buttons only; default true. */
  readonly enabled?: boolean
  /** Fields only; default ''. */
  readonly text?: string
  /** px on the 512 x 342 card canvas. */
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
}

export interface Example {
  readonly id: string
  readonly title: string
  /** Byte-identical to .kiro/specs/flip-card/examples/<id>.hc/description.txt. */
  readonly description: string
  /** Byte-identical to .kiro/specs/flip-card/examples/<id>.hc/script.hc. */
  readonly script: string
  readonly objects: readonly ExampleObject[]
}
