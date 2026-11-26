// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { RunResult } from '../interpreter'
import { seedCards } from '../store'
import type { Card } from '../store'
import { createCardRuntime, MAX_SCRIPTED_MOVES, NAVIGATION_LOOP_MESSAGE, type CardMount, type CardRuntime } from './cardRuntime'

const NOW = new Date(2026, 10, 1, 15, 4)

function mount(): CardMount & { root: HTMLElement } {
  const root = document.createElement('div')
  const make = (testid: string) => {
    const el = document.createElement('div')
    el.dataset['testid'] = testid
    root.append(el)
    return el
  }
  document.body.append(root)
  return { root, canvas: make('canvas'), statusLine: make('status-line'), messageBox: make('message-box'), dialogRoot: make('dialogs') }
}

function card(id: string): Card {
  const found = seedCards(NOW).find((c) => c.id === id)
  if (found === undefined) throw new Error(`no seeded card ${id}`)
  return found
}

function setup() {
  const onNavigate = vi.fn()
  const onResult = vi.fn()
  const runtime = createCardRuntime({ cardCount: () => 6, onNavigate, onResult, now: () => NOW })
  const m = mount()
  const q = <T extends HTMLElement>(testid: string) => m.root.querySelector<T>(`[data-testid="${testid}"]`)
  return { runtime, m, q, onNavigate, onResult }
}

describe('CardRuntime', () => {
  it('runs openCard on mount and exposes the program with source === card.script', () => {
    const { runtime, m, q } = setup()
    const hello = card('hello')
    const result = runtime.run(hello, m)
    expect(result).toEqual({ ok: true, statements: 1 })
    expect(runtime.currentProgram('hello')?.source).toBe(hello.script)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hello, world!')
  })

  it('clicks the counter button three times and the field reads 3', () => {
    const { runtime, m, q } = setup()
    runtime.run(card('counter'), m)
    const field = q<HTMLTextAreaElement>('field-count')
    expect(field?.value).toBe('0')
    for (let i = 0; i < 3; i += 1) q<HTMLButtonElement>('button-increment')?.click()
    expect(field?.value).toBe('3')
  })

  it('shows one dialog for the quiz answer 4 and navigates to card 2 only after OK', () => {
    const { runtime, m, q, onNavigate } = setup()
    runtime.run(card('quiz'), m)
    const answer = q<HTMLTextAreaElement>('field-answer')
    if (answer === null) throw new Error('no answer field')
    answer.value = '4'
    q<HTMLButtonElement>('button-check')?.click()

    const dialogs = m.root.querySelectorAll('[data-testid="answer-dialog"]')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.querySelector('p')?.textContent).toBe('Correct!')
    expect(runtime.dialogOpen()).toBe(true)
    expect(onNavigate).not.toHaveBeenCalled()

    // Buttons are inert while the dialog is open.
    q<HTMLButtonElement>('button-check')?.click()
    expect(m.root.querySelectorAll('[data-testid="answer-dialog"]')).toHaveLength(1)

    q<HTMLButtonElement>('answer-ok')?.click()
    expect(m.root.querySelector('[data-testid="answer-dialog"]')).toBeNull()
    expect(runtime.dialogOpen()).toBe(false)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith(2)
  })

  it('closes a dialog on Enter', () => {
    const { runtime, m, q } = setup()
    runtime.run(card('greeter'), m)
    q<HTMLButtonElement>('button-greet')?.click()
    const dialog = q<HTMLDialogElement>('answer-dialog')
    expect(dialog?.querySelector('p')?.textContent).toBe('Please enter your name.')
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(q('answer-dialog')).toBeNull()
  })

  it('shows dialogs one at a time, in order', () => {
    const { m, q } = setup()
    const custom: Card = {
      ...card('hello'),
      script: 'on openCard\n  answer "one"\n  answer "two"\n  go to card 3\nend openCard\n',
    }
    const navigations: number[] = []
    const rt = createCardRuntime({ cardCount: () => 6, onNavigate: (n) => navigations.push(n), now: () => NOW })
    rt.run(custom, m)
    expect(q('answer-dialog')?.querySelector('p')?.textContent).toBe('one')
    expect(navigations).toEqual([])
    q<HTMLButtonElement>('answer-ok')?.click()
    expect(q('answer-dialog')?.querySelector('p')?.textContent).toBe('two')
    expect(navigations).toEqual([])
    q<HTMLButtonElement>('answer-ok')?.click()
    expect(q('answer-dialog')).toBeNull()
    expect(navigations).toEqual([3])
  })

  it('writes runtime errors to the status line and reports them', () => {
    const { runtime, m, q, onResult } = setup()
    const broken: Card = { ...card('hello'), script: 'on openCard\n  put field "nope" into x\nend openCard\n' }
    const result = runtime.run(broken, m)
    expect(result.ok).toBe(false)
    expect(q('status-line')?.textContent).toBe('Runtime error in openCard, line 2: field "nope" does not exist')
    expect(onResult).toHaveBeenCalledWith('hello', 'openCard', result)
  })

  it('clears the status line on a successful handler', () => {
    const { runtime, m, q } = setup()
    const flaky: Card = {
      ...card('counter'),
      script: 'on mouseUp\n  if the target is "Increment" then put field "nope" into x\nend mouseUp\n',
    }
    runtime.run(flaky, m)
    q<HTMLButtonElement>('button-increment')?.click()
    expect(q('status-line')?.textContent).toContain('does not exist')
    runtime.click('counter', 'Other')
    expect(q('status-line')?.textContent).toBe('')
  })

  it('rerun discards live field text and visibility and runs openCard again', () => {
    const { runtime, m, q } = setup()
    const c = card('counter')
    runtime.run(c, m)
    q<HTMLButtonElement>('button-increment')?.click()
    expect(q<HTMLTextAreaElement>('field-count')?.value).toBe('1')
    const result = runtime.rerun(c)
    expect(result.ok).toBe(true)
    expect(q<HTMLTextAreaElement>('field-count')?.value).toBe('0')
    expect(runtime.currentProgram('counter')?.source).toBe(c.script)
  })

  it('rerun uses the new snapshot script', () => {
    const { runtime, m, q } = setup()
    const c = card('hello')
    runtime.run(c, m)
    const edited: Card = { ...c, script: 'on openCard\n  put "Hi, Kiro!" into field "greeting"\nend openCard\n' }
    runtime.rerun(edited)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('Hi, Kiro!')
    expect(runtime.currentProgram('hello')?.source).toBe(edited.script)
  })

  it('reports a stored script that does not parse in the status line', () => {
    const { runtime, m, q } = setup()
    const broken: Card = { ...card('hello'), script: 'on openCard\n' }
    const result = runtime.run(broken, m)
    expect(result.ok).toBe(false)
    expect(q('status-line')?.textContent).toBe(
      'Stored script does not parse (line 2, column 1: expected "end openCard", found end of script). Fix it on the back of the card.',
    )
    expect(runtime.currentProgram('hello')).toBeUndefined()
  })

  it('writes put without into to the message box', () => {
    const { runtime, m, q } = setup()
    const chatty: Card = { ...card('hello'), script: 'on openCard\n  put "hello there"\nend openCard\n' }
    runtime.run(chatty, m)
    expect(q('message-box')?.textContent).toBe('hello there')
  })

  it('unmount removes the objects and any open dialog', () => {
    const { runtime, m, q } = setup()
    runtime.run(card('greeter'), m)
    q<HTMLButtonElement>('button-greet')?.click()
    expect(q('answer-dialog')).not.toBeNull()
    runtime.unmount('greeter')
    expect(q('answer-dialog')).toBeNull()
    expect(q('button-greet')).toBeNull()
    expect(runtime.currentProgram('greeter')).toBeUndefined()
    expect(runtime.click('greeter', 'Greet')).toBeUndefined()
  })
})

// Task 18.3: design.md §5.6, requirements 7.1 to 7.3 and 7.7.

const STOPPED = 'Stopped: openCard scripts kept sending the stack from card to card. Flip the card to fix its script.'

const onOpen = (body: string): string => `on openCard\n  ${body}\nend openCard\n`
const onPress = (body: string): string => `on mouseUp\n  ${body}\nend mouseUp\n`
const goTo = (n: number): string => `go to card ${String(n)}`
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index)

/** `count` scripts; the cards numbered `from` to `to` send the stack to the next card from openCard, the others are empty. */
function relay(count: number, from: number, to: number): string[] {
  return range(1, count).map((n) => (n >= from && n <= to ? onOpen(goTo(n + 1)) : ''))
}

interface Stack {
  readonly runtime: CardRuntime
  /** The numbers of the cards whose openCard ran, in order. */
  readonly opened: readonly number[]
  /** Shows card n, as Previous and Next do. */
  show(n: number): RunResult
  /** Presses the button of the card that is showing. */
  press(): void
  /** Gives card n a new script and re-runs it, as the view does after a commit. */
  commit(n: number, script: string): RunResult
  /** Re-runs the card that is showing. */
  refresh(): void
  /** The number of the card that is showing. */
  number(): number | undefined
  /** The status line of the card that is showing. */
  status(): string | null | undefined
  q<T extends HTMLElement>(testid: string): T | null
}

/**
 * A stack whose cards carry the given scripts, shown one card at a time the
 * way the app shows them: a navigation unmounts the card that is showing and
 * runs the target on a mount of its own. Every card has a field "log" and a
 * button "go". `afterNavigate` is what the host does once the target has been
 * shown; the app does nothing.
 */
function stack(scripts: readonly string[], afterNavigate: (host: Stack) => void = () => undefined): Stack {
  const cards: Card[] = scripts.map((script, index) => ({
    id: `c${String(index + 1)}`,
    number: index + 1,
    name: `Card ${String(index + 1)}`,
    description: '',
    script,
    scriptOrigin: { kind: 'seed' },
    objects: [
      { kind: 'field', name: 'log', visible: true, text: '', rect: { x: 0, y: 0, w: 100, h: 20 } },
      { kind: 'button', name: 'go', visible: true, rect: { x: 0, y: 30, w: 100, h: 20 } },
    ],
    updatedAt: NOW.toISOString(),
  }))
  const opened: number[] = []
  let showing: { readonly card: Card; readonly m: ReturnType<typeof mount> } | null = null
  const runtime = createCardRuntime({
    cardCount: () => cards.length,
    onNavigate: (n) => {
      host.show(n)
      afterNavigate(host)
    },
    onResult: (id, handler) => {
      if (handler !== 'openCard') return
      opened.push(Number(id.slice(1)))
      // A chain the runtime fails to stop ends here, with a message, and not in a stack overflow.
      if (opened.length > 200) throw new Error('openCard ran more than 200 times')
    },
    now: () => NOW,
  })
  const host: Stack = {
    runtime,
    opened,
    show(n) {
      const card = cards[n - 1]
      if (card === undefined) throw new Error(`no card ${String(n)}`)
      if (showing !== null) {
        runtime.unmount(showing.card.id)
        showing.m.root.remove()
      }
      const m = mount()
      showing = { card, m }
      return runtime.run(card, m)
    },
    press() {
      const button = host.q<HTMLButtonElement>('button-go')
      if (button === null) throw new Error('no button on the card that is showing')
      button.click()
    },
    commit(n, script) {
      const card = cards[n - 1]
      if (card === undefined) throw new Error(`no card ${String(n)}`)
      const updated: Card = { ...card, script }
      cards[n - 1] = updated
      if (showing?.card.id === updated.id) showing = { card: updated, m: showing.m }
      return runtime.rerun(updated)
    },
    refresh() {
      if (showing !== null) runtime.rerun(showing.card)
    },
    number: () => showing?.card.number,
    status: () => showing?.m.statusLine.textContent,
    q: <T extends HTMLElement>(testid: string) => showing?.m.root.querySelector<T>(`[data-testid="${testid}"]`) ?? null,
  }
  return host
}

describe('a chain of openCard handlers that send the stack on', () => {
  it('exports the limit and the message of requirement 7.1', () => {
    expect(MAX_SCRIPTED_MOVES).toBe(16)
    expect(NAVIGATION_LOOP_MESSAGE).toBe(STOPPED)
  })

  it('stops a card that sends the stack to itself: it returns, the card shows, the status line says why', () => {
    const s = stack([onOpen(goTo(1))])
    const result = s.show(1)
    expect(result).toEqual({ ok: true, statements: 1 })
    expect(s.opened).toEqual([1, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })

  it('stops two cards that send the stack to each other, on the card that asked twice', () => {
    const s = stack([onOpen(goTo(2)), onOpen(goTo(1))])
    s.show(1)
    expect(s.opened).toEqual([1, 2, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })

  it('does not take the OK of a dialog for a user action: the dialog shows twice, then the message', () => {
    const s = stack([onOpen('answer "hi"\n  go to card 1')])
    s.show(1)
    for (let shown = 1; shown <= 2; shown += 1) {
      expect(s.q('answer-dialog')?.querySelector('p')?.textContent).toBe('hi')
      expect(s.status()).toBe('')
      expect(s.opened).toHaveLength(shown)
      s.q<HTMLButtonElement>('answer-ok')?.click()
    }
    expect(s.q('answer-dialog')).toBeNull()
    expect(s.runtime.dialogOpen()).toBe(false)
    expect(s.opened).toEqual([1, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })

  it('performs the move a button asks for and the move the target card asks for in turn', () => {
    const s = stack([onPress(goTo(2)), onOpen(goTo(3)), onOpen('put "three" into field "log"')])
    s.show(1)
    s.press()
    expect(s.opened).toEqual([1, 2, 3])
    expect(s.number()).toBe(3)
    expect(s.status()).toBe('')
    expect(s.q<HTMLTextAreaElement>('field-log')?.value).toBe('three')
  })

  it('starts a new chain at every press of a button, by a click or by click()', () => {
    const s = stack([onPress(goTo(2)), onOpen(goTo(1))])
    s.show(1)
    s.press()
    expect(s.opened).toEqual([1, 2, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe('')
    s.press()
    expect(s.opened).toEqual([1, 2, 1, 2, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe('')
    expect(s.runtime.click('c1', 'go')?.ok).toBe(true)
    expect(s.opened).toEqual([1, 2, 1, 2, 1, 2, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe('')
  })

  it('performs 16 moves in a row', () => {
    const s = stack(relay(17, 1, 16))
    s.show(1)
    expect(s.opened).toEqual(range(1, 17))
    expect(s.number()).toBe(17)
    expect(s.status()).toBe('')
  })

  it('stops the 17th move of a chain that no card repeats: 40 cards, the message is on card 17', () => {
    const s = stack(relay(40, 1, 39))
    s.show(1)
    expect(s.opened).toEqual(range(1, 17))
    expect(s.number()).toBe(17)
    expect(s.status()).toBe(STOPPED)
  })

  it('does not count the move a button asked for: a press can be followed by 16 moves, not by 17', () => {
    const s = stack([onPress(goTo(2)), ...relay(18, 2, 17).slice(1)])
    s.show(1)
    s.press()
    expect(s.opened).toEqual(range(1, 18))
    expect(s.number()).toBe(18)
    expect(s.status()).toBe('')

    const longer = stack([onPress(goTo(2)), ...relay(19, 2, 18).slice(1)])
    longer.show(1)
    longer.press()
    expect(longer.opened).toEqual(range(1, 18))
    expect(longer.number()).toBe(18)
    expect(longer.status()).toBe(STOPPED)
  })

  it('starts afresh when the user moves on after a stop', () => {
    const s = stack([onOpen(goTo(1)), onOpen('put "two" into field "log"')])
    s.show(1)
    expect(s.status()).toBe(STOPPED)
    s.show(2)
    expect(s.number()).toBe(2)
    expect(s.status()).toBe('')
    expect(s.q<HTMLTextAreaElement>('field-log')?.value).toBe('two')
    s.show(1)
    expect(s.opened).toEqual([1, 1, 2, 1, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })

  it('clears the message when a commit gives the card a script that stays', () => {
    const s = stack([onOpen(goTo(1))])
    s.show(1)
    expect(s.status()).toBe(STOPPED)
    expect(s.commit(1, onOpen('put "fixed" into field "log"'))).toEqual({ ok: true, statements: 1 })
    expect(s.opened).toEqual([1, 1, 1])
    expect(s.status()).toBe('')
    expect(s.q<HTMLTextAreaElement>('field-log')?.value).toBe('fixed')
  })

  it('starts afresh at a commit: after a stop, a script that sends the stack to another card is obeyed', () => {
    const s = stack([onOpen(goTo(1)), onOpen('put "two" into field "log"')])
    s.show(1)
    expect(s.status()).toBe(STOPPED)
    s.commit(1, onOpen(goTo(2)))
    expect(s.opened).toEqual([1, 1, 1, 2])
    expect(s.number()).toBe(2)
    expect(s.status()).toBe('')
    expect(s.q<HTMLTextAreaElement>('field-log')?.value).toBe('two')
  })

  it('stops a looping script that a commit brings in: openCard runs twice, then the message', () => {
    const s = stack([''])
    s.show(1)
    expect(s.opened).toEqual([1])
    s.commit(1, onOpen(goTo(1)))
    expect(s.opened).toEqual([1, 1, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })

  // The app runs one card per navigation. The runtime does not rely on that:
  // whatever the host runs before onNavigate returns belongs to the chain, also
  // after a navigation further down has returned.
  it('counts every run made before onNavigate returns as part of the chain', () => {
    const s = stack([onOpen(goTo(2)), onOpen(goTo(1))], (host) => {
      host.refresh()
    })
    s.show(1)
    expect(s.opened).toEqual([1, 2, 1, 1, 1])
    expect(s.number()).toBe(1)
    expect(s.status()).toBe(STOPPED)
  })
})

describe('a card whose stored script does not parse', () => {
  const BROKEN = 'on openCard\n'
  const FIXED = 'on openCard\n  put "fixed" into field "greeting"\nend openCard\n'

  it('runs on the same mount once it is re-run with a script that parses', () => {
    const { runtime, m, q } = setup()
    const broken: Card = { ...card('hello'), script: BROKEN }
    expect(runtime.run(broken, m).ok).toBe(false)
    expect(q('status-line')?.textContent).toContain('Stored script does not parse')
    const fixed: Card = { ...broken, script: FIXED }
    expect(runtime.rerun(fixed)).toEqual({ ok: true, statements: 1 })
    expect(q('status-line')?.textContent).toBe('')
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('fixed')
    expect(runtime.currentProgram('hello')?.source).toBe(FIXED)
  })

  it('keeps the mount through a second script that does not parse, and after a script that did', () => {
    const { runtime, m, q } = setup()
    const hello = card('hello')
    expect(runtime.run(hello, m).ok).toBe(true)
    expect(runtime.rerun({ ...hello, script: BROKEN }).ok).toBe(false)
    expect(runtime.rerun({ ...hello, script: 'on mouseUp\n' }).ok).toBe(false)
    expect(q('status-line')?.textContent).toBe(
      'Stored script does not parse (line 2, column 1: expected "end mouseUp", found end of script). Fix it on the back of the card.',
    )
    expect(q('field-greeting')).toBeNull()
    expect(runtime.rerun({ ...hello, script: FIXED }).ok).toBe(true)
    expect(q<HTMLTextAreaElement>('field-greeting')?.value).toBe('fixed')
  })

  it('is forgotten on unmount, and a card that was never run is still refused', () => {
    const { runtime, m } = setup()
    runtime.run({ ...card('hello'), script: BROKEN }, m)
    runtime.unmount('hello')
    expect(() => runtime.rerun({ ...card('hello'), script: FIXED })).toThrow('card "hello" is not mounted')
    expect(() => runtime.rerun(card('counter'))).toThrow('card "counter" is not mounted')
  })
})
