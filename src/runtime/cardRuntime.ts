// CardRuntime (design.md §2, §5.5, §7.1): given a card snapshot, parses
// `card.script`, builds a DOM-backed Host, sends openCard, routes button
// clicks to mouseUp, shows runtime errors in the status line, drains queued
// answer dialogs one at a time and then performs a recorded goToCard. It
// exposes `currentProgram(id)` for the byte-identity check: the program's
// `source` is `card.script` by reference. It also stops a chain of `openCard`
// handlers that keep sending the stack on (§5.6).
import { run, type RunResult } from '../interpreter'
import { parse, type HandlerName, type Program } from '../parser'
import type { Card } from '../store'
import { DomHost } from './domHost'

export interface CardMount {
  /** The 512 x 342 canvas the objects render into. */
  readonly canvas: HTMLElement
  readonly statusLine: HTMLElement
  readonly messageBox: HTMLElement
  /** Where answer dialogs are appended. */
  readonly dialogRoot: HTMLElement
}

export interface CardRuntimeOptions {
  /** Number of cards in the stack (for `go to card` range checks). */
  readonly cardCount: () => number
  /**
   * Called after the last dialog is dismissed when a handler asked to go to card n.
   * `sentOnBy` holds the ids of the cards whose `openCard` has moved the stack on
   * since the last user action, in order; it is empty when a button asked (§5.7).
   */
  readonly onNavigate: (n: number, sentOnBy: readonly string[]) => void
  /** Called after every handler run with its result, for status mirrors. */
  readonly onResult?: (id: string, handler: HandlerName, result: RunResult) => void
  readonly now?: () => Date
}

export interface CardRuntime {
  /** Mounts the card and runs it: live state from `objects`, then openCard. */
  run(card: Card, mount: CardMount): RunResult
  /**
   * Mounts the card without sending `openCard` (§5.7): its objects show and its
   * buttons work, and the status line says that `openCard` did not run. For a
   * card whose `openCard` sends the stack away before it can be flipped.
   */
  hold(card: Card, mount: CardMount): void
  /** Re-runs an already mounted card from a fresh snapshot: tear down live state, re-seed, openCard. */
  rerun(card: Card): RunResult
  /** The Program the mounted card runs; `source === card.script`. */
  currentProgram(id: string): Program | undefined
  /** Sends mouseUp for a button of the mounted card, as a click would. */
  click(id: string, buttonName: string): RunResult | undefined
  /** True while an answer dialog is open. */
  dialogOpen(): boolean
  /** Tears the mounted card down. */
  unmount(id: string): void
}

interface Mounted {
  readonly card: Card
  readonly mount: CardMount
  readonly program: Program
  readonly host: DomHost
}

/** How many `openCard` handlers may send the stack on after one user action (design.md §5.6). */
export const MAX_SCRIPTED_MOVES = 16

/** Status line text when the runtime drops an `openCard` handler's `go to card` (requirement 7.1). */
export const NAVIGATION_LOOP_MESSAGE =
  'Stopped: openCard scripts kept sending the stack from card to card. Flip the card to fix its script.'

/** Status line text of a card that `hold` mounted (requirement 7.8). */
export const HELD_MESSAGE =
  'This card was opened without running its openCard handler. Commit a script on the back to run it.'

export function createCardRuntime(options: CardRuntimeOptions): CardRuntime {
  const mounted = new Map<string, Mounted>()
  /** Mounts of cards whose stored script did not parse, so a later `rerun` has somewhere to run (requirement 7.7). */
  const unparsed = new Map<string, CardMount>()
  let openDialog: HTMLDialogElement | null = null

  // The navigation chain (§5.6). `scriptedDepth` is above 0 while one of our own
  // onNavigate calls is on the stack: a run() made then was caused by a script,
  // not by the user. `movedOn` holds the ids of the cards whose openCard has
  // already sent the stack on since the last user action.
  let scriptedDepth = 0
  const movedOn = new Set<string>()

  /** A run, a re-run or a click the user caused starts a new chain. */
  function userAction(): void {
    if (scriptedDepth === 0) movedOn.clear()
  }

  function statusFor(handler: HandlerName, result: RunResult): string {
    if (result.ok) return ''
    return `Runtime error in ${handler}, line ${String(result.error.line)}: ${result.error.message}`
  }

  function send(entry: Mounted, handler: HandlerName, target: string): RunResult {
    const result = run(entry.program, handler, entry.host, { target })
    entry.mount.statusLine.textContent = statusFor(handler, result)
    options.onResult?.(entry.card.id, handler, result)
    // A handler that stopped with an error does not move the stack: the card
    // stays, with the error in its status line. Its dialogs are still shown.
    if (!result.ok) entry.host.pendingNavigation = null
    drain(entry, handler)
    return result
  }

  /**
   * Shows queued dialogs one at a time, then navigates if `handler` asked to
   * (§5.5), unless the chain has to stop here (§5.6). Closing a dialog is not a
   * user action: the chain that queued it goes on.
   */
  function drain(entry: Mounted, handler: HandlerName): void {
    const next = entry.host.pendingDialogs.shift()
    if (next !== undefined) {
      showDialog(entry, next, () => {
        drain(entry, handler)
      })
      return
    }
    const n = entry.host.pendingNavigation
    entry.host.pendingNavigation = null
    if (n === null) return
    if (handler === 'openCard') {
      if (movedOn.has(entry.card.id) || movedOn.size >= MAX_SCRIPTED_MOVES) {
        entry.mount.statusLine.textContent = NAVIGATION_LOOP_MESSAGE
        return
      }
      movedOn.add(entry.card.id)
    }
    // A depth and not a flag: the card shown by onNavigate may navigate in turn.
    scriptedDepth += 1
    try {
      options.onNavigate(n, [...movedOn])
    } finally {
      scriptedDepth -= 1
    }
  }

  function showDialog(entry: Mounted, message: string, onClose: () => void): void {
    const doc = entry.mount.dialogRoot.ownerDocument
    const dialog = doc.createElement('dialog')
    dialog.dataset['testid'] = 'answer-dialog'
    dialog.className = 'answer-dialog'
    const text = doc.createElement('p')
    text.textContent = message
    const form = doc.createElement('form')
    form.method = 'dialog'
    const ok = doc.createElement('button')
    ok.type = 'submit'
    ok.textContent = 'OK'
    ok.dataset['testid'] = 'answer-ok'
    form.append(ok)
    dialog.append(text, form)

    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      dialog.removeEventListener('keydown', onKey)
      if (typeof dialog.close === 'function') dialog.close()
      dialog.remove()
      if (openDialog === dialog) openDialog = null
      entry.host.inert = false
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        close()
      }
    }
    ok.addEventListener('click', (event) => {
      event.preventDefault()
      close()
    })
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close()
    })
    dialog.addEventListener('keydown', onKey)
    // Every way of closing fires `close`, also one that fired no `cancel`.
    dialog.addEventListener('close', close)

    entry.host.inert = true
    openDialog = dialog
    entry.mount.dialogRoot.append(dialog)
    // jsdom has no showModal; fall back to the open attribute there.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    ok.focus()
  }

  function failedParse(mount: CardMount, message: string): RunResult {
    mount.statusLine.textContent = message
    return { ok: false, statements: 0, error: { message, line: 0, column: 0, handler: 'openCard' } }
  }

  function mountCard(card: Card, mount: CardMount): Mounted | RunResult {
    const parsed = parse(card.script)
    if (!parsed.ok) {
      const { line, column, message } = parsed.error
      unparsed.set(card.id, mount)
      return failedParse(mount, `Stored script does not parse (line ${String(line)}, column ${String(column)}: ${message}). Fix it on the back of the card.`)
    }
    const program = parsed.program
    const host = new DomHost(mount.canvas, card.objects, {
      cardCount: options.cardCount(),
      messageBox: mount.messageBox,
      ...(options.now === undefined ? {} : { now: options.now }),
      onButtonClick: (name) => {
        const entry = mounted.get(card.id)
        if (entry === undefined) return
        userAction()
        send(entry, 'mouseUp', name)
      },
    })
    mount.statusLine.textContent = ''
    mount.messageBox.textContent = ''
    const entry: Mounted = { card, mount, program, host }
    mounted.set(card.id, entry)
    return entry
  }

  function unmount(id: string): void {
    unparsed.delete(id)
    const entry = mounted.get(id)
    if (entry === undefined) return
    if (openDialog !== null) {
      openDialog.remove()
      openDialog = null
    }
    entry.host.dispose()
    mounted.delete(id)
  }

  return {
    run(card, mount) {
      userAction()
      unmount(card.id)
      const entry = mountCard(card, mount)
      if (!('host' in entry)) return entry
      return send(entry, 'openCard', '')
    },

    hold(card, mount) {
      userAction()
      unmount(card.id)
      const entry = mountCard(card, mount)
      // A script that does not parse keeps its own message (requirement 7.7).
      if ('host' in entry) mount.statusLine.textContent = HELD_MESSAGE
    },

    rerun(card) {
      const mount = mounted.get(card.id)?.mount ?? unparsed.get(card.id)
      if (mount === undefined) throw new Error(`card "${card.id}" is not mounted`)
      userAction()
      unmount(card.id)
      const entry = mountCard(card, mount)
      if (!('host' in entry)) return entry
      return send(entry, 'openCard', '')
    },

    currentProgram: (id) => mounted.get(id)?.program,

    click(id, buttonName) {
      const entry = mounted.get(id)
      if (entry === undefined || entry.host.inert) return undefined
      userAction()
      return send(entry, 'mouseUp', buttonName)
    },

    dialogOpen: () => openDialog !== null,
    unmount,
  }
}
