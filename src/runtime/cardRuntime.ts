// CardRuntime (design.md §2, §5.5, §7.1): given a card snapshot, parses
// `card.script`, builds a DOM-backed Host, sends openCard, routes button
// clicks to mouseUp, shows runtime errors in the status line, drains queued
// answer dialogs one at a time and then performs a recorded goToCard. It
// exposes `currentProgram(id)` for the byte-identity check: the program's
// `source` is `card.script` by reference.
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
  /** Called after the last dialog is dismissed when a handler asked to go to card n. */
  readonly onNavigate: (n: number) => void
  /** Called after every handler run with its result, for status mirrors. */
  readonly onResult?: (id: string, handler: HandlerName, result: RunResult) => void
  readonly now?: () => Date
}

export interface CardRuntime {
  /** Mounts the card and runs it: live state from `objects`, then openCard. */
  run(card: Card, mount: CardMount): RunResult
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

export function createCardRuntime(options: CardRuntimeOptions): CardRuntime {
  const mounted = new Map<string, Mounted>()
  let openDialog: HTMLDialogElement | null = null

  function statusFor(handler: HandlerName, result: RunResult): string {
    if (result.ok) return ''
    return `Runtime error in ${handler}, line ${String(result.error.line)}: ${result.error.message}`
  }

  function send(entry: Mounted, handler: HandlerName, target: string): RunResult {
    const result = run(entry.program, handler, entry.host, { target })
    entry.mount.statusLine.textContent = statusFor(handler, result)
    options.onResult?.(entry.card.id, handler, result)
    drain(entry)
    return result
  }

  /** Shows queued dialogs one at a time, then navigates if asked (§5.5). */
  function drain(entry: Mounted): void {
    const next = entry.host.pendingDialogs.shift()
    if (next !== undefined) {
      showDialog(entry, next, () => {
        drain(entry)
      })
      return
    }
    const n = entry.host.pendingNavigation
    entry.host.pendingNavigation = null
    if (n !== null) options.onNavigate(n)
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
      return failedParse(mount, `Stored script does not parse (line ${String(line)}, column ${String(column)}: ${message}). Fix it on the back of the card.`)
    }
    const program = parsed.program
    const host = new DomHost(mount.canvas, card.objects, {
      cardCount: options.cardCount(),
      messageBox: mount.messageBox,
      ...(options.now === undefined ? {} : { now: options.now }),
      onButtonClick: (name) => {
        const entry = mounted.get(card.id)
        if (entry !== undefined) send(entry, 'mouseUp', name)
      },
    })
    mount.statusLine.textContent = ''
    mount.messageBox.textContent = ''
    const entry: Mounted = { card, mount, program, host }
    mounted.set(card.id, entry)
    return entry
  }

  function unmount(id: string): void {
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
      unmount(card.id)
      const entry = mountCard(card, mount)
      if (!('host' in entry)) return entry
      return send(entry, 'openCard', '')
    },

    rerun(card) {
      const previous = mounted.get(card.id)
      if (previous === undefined) throw new Error(`card "${card.id}" is not mounted`)
      unmount(card.id)
      const entry = mountCard(card, previous.mount)
      if (!('host' in entry)) return entry
      return send(entry, 'openCard', '')
    },

    currentProgram: (id) => mounted.get(id)?.program,

    click(id, buttonName) {
      const entry = mounted.get(id)
      if (entry === undefined || entry.host.inert) return undefined
      return send(entry, 'mouseUp', buttonName)
    },

    dialogOpen: () => openDialog !== null,
    unmount,
  }
}
