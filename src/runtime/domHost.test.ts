// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { CardObject } from '../store'
import { DomHost, testIdFor } from './domHost'

const NOW = new Date(2026, 10, 1, 15, 4)

const OBJECTS: CardObject[] = [
  { kind: 'field', name: 'count', visible: true, text: '0', rect: { x: 32, y: 40, w: 200, h: 40 } },
  { kind: 'field', name: 'hidden one', visible: false, text: '', rect: { x: 0, y: 0, w: 10, h: 10 } },
  { kind: 'button', name: 'Increment', visible: true, enabled: true, rect: { x: 32, y: 100, w: 160, h: 32 } },
  { kind: 'button', name: 'Off', visible: true, enabled: false, rect: { x: 0, y: 0, w: 10, h: 10 } },
]

function setup(objects: CardObject[] = OBJECTS) {
  const container = document.createElement('div')
  const messageBox = document.createElement('div')
  const onButtonClick = vi.fn()
  const host = new DomHost(container, objects, { cardCount: 6, onButtonClick, messageBox, now: () => NOW })
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  return { container, messageBox, onButtonClick, host, byTestId }
}

describe('DomHost', () => {
  it('renders fields as positioned textareas and buttons as buttons with the data-testid names', () => {
    const { byTestId } = setup()
    const count = byTestId('field-count') as HTMLTextAreaElement
    expect(count.tagName).toBe('TEXTAREA')
    expect(count.value).toBe('0')
    expect(count.style.left).toBe('32px')
    expect(count.style.top).toBe('40px')
    expect(count.style.width).toBe('200px')
    expect(count.style.height).toBe('40px')
    expect(count.hidden).toBe(false)
    expect((byTestId('field-hidden-one') as HTMLElement).hidden).toBe(true)
    const button = byTestId('button-increment') as HTMLButtonElement
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toBe('Increment')
    expect(button.disabled).toBe(false)
    expect((byTestId('button-off') as HTMLButtonElement).disabled).toBe(true)
  })

  it('lower-cases and dashes names for data-testid', () => {
    expect(testIdFor('button', 'Go Now Please')).toBe('button-go-now-please')
  })

  it('hasObject matches case-insensitively and keeps kinds apart', () => {
    const { host } = setup()
    expect(host.hasObject('field', 'COUNT')).toBe(true)
    expect(host.hasObject('button', 'count')).toBe(false)
    expect(host.hasObject('button', 'increment')).toBe(true)
  })

  it('reads field text live from the DOM', () => {
    const { host, byTestId } = setup()
    ;(byTestId('field-count') as HTMLTextAreaElement).value = 'typed'
    expect(host.getFieldText('count')).toBe('typed')
    expect(host.getFieldText('nope')).toBeUndefined()
  })

  it('writes field text', () => {
    const { host, byTestId } = setup()
    expect(host.setFieldText('Count', '42')).toBe(true)
    expect((byTestId('field-count') as HTMLTextAreaElement).value).toBe('42')
    expect(host.setFieldText('nope', 'x')).toBe(false)
  })

  it('getName returns the current name', () => {
    const { host } = setup()
    expect(host.getName('button', 'increment')).toBe('Increment')
    expect(host.getName('field', 'nope')).toBeUndefined()
  })

  it('setVisible toggles hidden', () => {
    const { host, byTestId } = setup()
    expect(host.setVisible('field', 'count', false)).toBe(true)
    expect((byTestId('field-count') as HTMLElement).hidden).toBe(true)
    expect(host.setVisible('field', 'hidden one', true)).toBe(true)
    expect((byTestId('field-hidden-one') as HTMLElement).hidden).toBe(false)
    expect(host.setVisible('button', 'nope', true)).toBe(false)
  })

  it('setEnabled toggles disabled on buttons only', () => {
    const { host, byTestId } = setup()
    expect(host.setEnabled('increment', false)).toBe(true)
    expect((byTestId('button-increment') as HTMLButtonElement).disabled).toBe(true)
    expect(host.setEnabled('count', false)).toBe(false)
  })

  it('setName renames the object, its label and its data-testid', () => {
    const { host, byTestId } = setup()
    expect(host.setName('button', 'increment', 'Add One')).toBe(true)
    expect(byTestId('button-increment')).toBeNull()
    const renamed = byTestId('button-add-one') as HTMLButtonElement
    expect(renamed.textContent).toBe('Add One')
    expect(host.hasObject('button', 'add one')).toBe(true)
    expect(host.hasObject('button', 'Increment')).toBe(false)
    expect(host.setName('field', 'count', 'total')).toBe(true)
    expect((byTestId('field-total') as HTMLElement).getAttribute('aria-label')).toBe('total')
    expect(host.setName('field', 'nope', 'x')).toBe(false)
  })

  it('routes button clicks with the current name and ignores disabled buttons', () => {
    const { host, byTestId, onButtonClick } = setup()
    ;(byTestId('button-increment') as HTMLButtonElement).click()
    expect(onButtonClick).toHaveBeenCalledWith('Increment')
    host.setName('button', 'increment', 'Plus')
    ;(byTestId('button-plus') as HTMLButtonElement).click()
    expect(onButtonClick).toHaveBeenLastCalledWith('Plus')
    ;(byTestId('button-off') as HTMLButtonElement).click()
    expect(onButtonClick).toHaveBeenCalledTimes(2)
  })

  it('ignores clicks while inert', () => {
    const { host, byTestId, onButtonClick } = setup()
    host.inert = true
    ;(byTestId('button-increment') as HTMLButtonElement).click()
    expect(onButtonClick).not.toHaveBeenCalled()
  })

  it('queues dialogs and records at most one navigation, the last one', () => {
    const { host } = setup()
    host.answer('one')
    host.answer('two')
    expect(host.pendingDialogs).toEqual(['one', 'two'])
    expect(host.goToCard(2)).toBe(true)
    expect(host.goToCard(3)).toBe(true)
    expect(host.pendingNavigation).toBe(3)
    expect(host.goToCard(7)).toBe(false)
    expect(host.goToCard(0)).toBe(false)
    expect(host.pendingNavigation).toBe(3)
  })

  it('writes the message box', () => {
    const { host, messageBox } = setup()
    host.message('hello')
    expect(messageBox.textContent).toBe('hello')
  })

  it('returns the injected clock', () => {
    const { host } = setup()
    expect(host.now()).toBe(NOW)
  })

  it('dispose empties the container', () => {
    const { host, container } = setup()
    host.dispose()
    expect(container.children).toHaveLength(0)
    expect(host.hasObject('field', 'count')).toBe(false)
  })
})
