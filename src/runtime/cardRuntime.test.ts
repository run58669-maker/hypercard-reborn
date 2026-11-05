// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { seedCards } from '../store'
import type { Card } from '../store'
import { createCardRuntime, type CardMount } from './cardRuntime'

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
