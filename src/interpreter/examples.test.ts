// The six bundled examples run against FakeHost with the layouts from
// design.md §3.2, driven the way a demo would drive them.
import { describe, expect, it } from 'vitest'
import countdownScript from '../../.kiro/specs/flip-card/examples/countdown.hc/script.hc?raw'
import counterScript from '../../.kiro/specs/flip-card/examples/counter.hc/script.hc?raw'
import dateStampScript from '../../.kiro/specs/flip-card/examples/date-stamp.hc/script.hc?raw'
import greeterScript from '../../.kiro/specs/flip-card/examples/greeter.hc/script.hc?raw'
import helloScript from '../../.kiro/specs/flip-card/examples/hello.hc/script.hc?raw'
import quizScript from '../../.kiro/specs/flip-card/examples/quiz.hc/script.hc?raw'
import { parse } from '../parser'
import type { Program } from '../parser'
import { FakeHost } from './fakeHost'
import type { HostObject } from './host'
import { run } from './interpreter'

const NOW = new Date(2026, 10, 1, 15, 4)

const LAYOUTS: Record<string, HostObject[]> = {
  hello: [{ kind: 'field', name: 'greeting', visible: true, text: '' }],
  counter: [
    { kind: 'field', name: 'count', visible: true, text: '' },
    { kind: 'button', name: 'Increment', visible: true },
  ],
  'date-stamp': [
    { kind: 'field', name: 'stamp', visible: true, text: '' },
    { kind: 'button', name: 'Stamp', visible: true },
  ],
  greeter: [
    { kind: 'field', name: 'name', visible: true, text: '' },
    { kind: 'button', name: 'Greet', visible: true },
  ],
  countdown: [
    { kind: 'field', name: 'list', visible: true, text: '' },
    { kind: 'button', name: 'Go', visible: true },
  ],
  quiz: [
    { kind: 'field', name: 'question', visible: true, text: '' },
    { kind: 'field', name: 'answer', visible: true, text: '' },
    { kind: 'button', name: 'Check', visible: true },
  ],
}

const SCRIPTS: Record<string, string> = {
  hello: helloScript,
  counter: counterScript,
  'date-stamp': dateStampScript,
  greeter: greeterScript,
  countdown: countdownScript,
  quiz: quizScript,
}

function open(id: string): { program: Program; host: FakeHost } {
  const result = parse(SCRIPTS[id] as string)
  if (!result.ok) throw new Error(result.error.message)
  const host = new FakeHost(LAYOUTS[id] as HostObject[], NOW)
  const opened = run(result.program, 'openCard', host, { target: '' })
  expect(opened.ok).toBe(true)
  return { program: result.program, host }
}

function click(program: Program, host: FakeHost, button: string): void {
  const result = run(program, 'mouseUp', host, { target: button })
  expect(result.ok).toBe(true)
}

describe('bundled examples', () => {
  it('hello greets the world on open', () => {
    const { host } = open('hello')
    expect(host.object('field', 'greeting')?.text).toBe('Hello, world!')
  })

  it('counter starts at 0 and counts three clicks', () => {
    const { program, host } = open('counter')
    expect(host.object('field', 'count')?.text).toBe('0')
    click(program, host, 'Increment')
    click(program, host, 'Increment')
    click(program, host, 'Increment')
    expect(host.object('field', 'count')?.text).toBe('3')
  })

  it('date-stamp hides the field on open and shows the date on Stamp', () => {
    const { program, host } = open('date-stamp')
    expect(host.object('field', 'stamp')?.visible).toBe(false)
    click(program, host, 'Stamp')
    expect(host.object('field', 'stamp')).toMatchObject({ visible: true, text: '11/1/26' })
  })

  it('greeter asks for a name when the field is empty and greets otherwise', () => {
    const { program, host } = open('greeter')
    click(program, host, 'Greet')
    expect(host.dialogs).toEqual(['Please enter your name.'])
    host.setFieldText('name', 'Ada')
    click(program, host, 'Greet')
    expect(host.dialogs).toEqual(['Please enter your name.', 'Hello, Ada!'])
  })

  it('countdown fills the list from 10 to 1 and Liftoff!', () => {
    const { program, host } = open('countdown')
    click(program, host, 'Go')
    expect(host.object('field', 'list')?.text).toBe('10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff!')
  })

  it('quiz shows the question on open, accepts 4 and goes to card 2, rejects 5', () => {
    const { program, host } = open('quiz')
    expect(host.object('field', 'question')?.text).toBe('What is 2 + 2?')
    expect(host.object('field', 'answer')?.text).toBe('')
    host.setFieldText('answer', '4')
    click(program, host, 'Check')
    expect(host.dialogs).toEqual(['Correct!'])
    expect(host.navigations).toEqual([2])

    host.setFieldText('answer', '5')
    click(program, host, 'Check')
    expect(host.dialogs).toEqual(['Correct!', 'Try again.'])
    expect(host.navigations).toEqual([2])
  })

  it('quiz accepts " 4 " and "4.0" as the numeric answer 4', () => {
    const { program, host } = open('quiz')
    host.setFieldText('answer', ' 4 ')
    click(program, host, 'Check')
    host.setFieldText('answer', '4.0')
    click(program, host, 'Check')
    expect(host.dialogs).toEqual(['Correct!', 'Correct!'])
  })

  it('ignores clicks on buttons the script does not name', () => {
    const { program, host } = open('counter')
    click(program, host, 'Other')
    expect(host.object('field', 'count')?.text).toBe('0')
  })
})
