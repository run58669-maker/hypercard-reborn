// Card data model and store API (design.md §3, §3.1).
import type { ParseError } from '../parser'

export interface Card {
  /** The example id for seeded cards ('hello'); crypto.randomUUID() otherwise. */
  readonly id: string
  /** 1-based position in the stack; `go to card N` uses this. */
  readonly number: number
  /** Shown in the header ("Hello"). */
  readonly name: string
  /** Natural language, as last saved by the author. */
  readonly description: string
  /** THE executable artefact. Verbatim: no trim, no newline normalisation. */
  readonly script: string
  /** Provenance for the back face; informational only. */
  readonly scriptOrigin: ScriptOrigin
  /** Front-face layout, in z-order (later = on top). */
  readonly objects: readonly CardObject[]
  /** ISO-8601. */
  readonly updatedAt: string
}

export type ScriptOrigin =
  | {
      readonly kind: 'compiled'
      readonly provider: 'anthropic' | 'canned'
      readonly model?: string
      readonly descriptionHash: string
      readonly at: string
    }
  | { readonly kind: 'edited'; readonly at: string }
  /** Bundled example card, never compiled in this browser. */
  | { readonly kind: 'seed' }

export interface CardObject {
  readonly kind: 'field' | 'button'
  /** What scripts refer to; unique per card, case-insensitive. */
  readonly name: string
  /** Initial visibility; scripts change the live copy, not this. */
  readonly visible: boolean
  /** Buttons only; default true. */
  readonly enabled?: boolean
  /** Fields only: initial text; default ''. */
  readonly text?: string
  /** px on a 512 x 342 card canvas. */
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
}

export interface CardStore {
  /** Sorted by number. */
  getCards(): readonly Card[]
  getCard(id: string): Card | undefined
  getCardByNumber(n: number): Card | undefined
  /** Never touches `script`. */
  saveDescription(id: string, description: string): void
  /** The only code path that writes `script`; refuses anything that does not parse. */
  commitScript(id: string, script: string, origin: ScriptOrigin): CommitResult
  /** Replaces every card with the bundled six. */
  resetToSeed(): void
  subscribe(listener: (change: StoreChange) => void): () => void
}

export type CommitResult =
  | { readonly ok: true; readonly card: Card }
  /** `card` is unchanged. */
  | { readonly ok: false; readonly error: ParseError; readonly card: Card }

export type StoreChange =
  | { readonly kind: 'description'; readonly id: string }
  | { readonly kind: 'script'; readonly id: string }
  | { readonly kind: 'reset' }
