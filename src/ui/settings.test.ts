// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createCardStore, seedCards, type StorageLike } from '../store'
import { API_KEY_KEY, PROVIDER_KEY, RESET_CONFIRMATION, createSettings, readProvider } from './settings'

const NOW = new Date(2026, 10, 1, 15, 4)

function fakeStorage(entries: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

function setup(entries: Record<string, string> = {}, confirmAnswer = true) {
  const storage = fakeStorage(entries)
  const store = createCardStore({ initial: seedCards(NOW), now: () => NOW })
  const confirm = vi.fn(() => confirmAnswer)
  const onProviderChange = vi.fn()
  const settings = createSettings({ store, storage, confirm, onProviderChange })
  document.body.replaceChildren(settings.element)
  const q = <T extends HTMLElement>(testid: string) => settings.element.querySelector<T>(`[data-testid="${testid}"]`)
  return { storage, store, confirm, onProviderChange, settings, q }
}

describe('readProvider', () => {
  it('defaults to canned', () => {
    expect(readProvider(fakeStorage())).toBe('canned')
    expect(readProvider(fakeStorage({ [PROVIDER_KEY]: 'garbage' }))).toBe('canned')
    expect(readProvider(fakeStorage({ [PROVIDER_KEY]: 'anthropic' }))).toBe('anthropic')
  })
})

describe('createSettings', () => {
  it('has every control from design.md §7.3 and defaults to the offline provider', () => {
    const { q, settings } = setup()
    for (const id of ['provider-canned', 'provider-anthropic', 'api-key', 'forget-key', 'reset-cards', 'settings-close']) {
      expect(q(id), id).not.toBeNull()
    }
    expect(settings.element.dataset['testid']).toBe('settings-panel')
    expect(q<HTMLInputElement>('provider-canned')?.checked).toBe(true)
    expect(q<HTMLInputElement>('provider-anthropic')?.checked).toBe(false)
    expect(settings.provider()).toBe('canned')
    expect(settings.element.textContent).toContain("stored in this browser's local storage")
  })

  it('opens and closes', () => {
    const { settings } = setup()
    settings.open()
    expect(settings.element.hasAttribute('open')).toBe(true)
    settings.close()
    expect(settings.element.hasAttribute('open')).toBe(false)
  })

  it('switching provider writes hcr.compileProvider and leaves every script unchanged', () => {
    const { q, storage, store, settings, onProviderChange } = setup()
    const scripts = store.getCards().map((c) => c.script)
    const anthropic = q<HTMLInputElement>('provider-anthropic')
    if (anthropic === null) throw new Error('no radio')
    anthropic.checked = true
    anthropic.dispatchEvent(new Event('change'))
    expect(storage.map.get(PROVIDER_KEY)).toBe('anthropic')
    expect(settings.provider()).toBe('anthropic')
    expect(onProviderChange).toHaveBeenCalledWith('anthropic')
    expect(store.getCards().map((c) => c.script)).toEqual(scripts)

    const canned = q<HTMLInputElement>('provider-canned')
    if (canned === null) throw new Error('no radio')
    canned.checked = true
    canned.dispatchEvent(new Event('change'))
    expect(storage.map.get(PROVIDER_KEY)).toBe('canned')
    expect(store.getCards().map((c) => c.script)).toEqual(scripts)
  })

  it('stores the key as typed under hcr.anthropicApiKey and forgets it', () => {
    const { q, storage } = setup()
    const input = q<HTMLInputElement>('api-key')
    const forget = q<HTMLButtonElement>('forget-key')
    if (input === null || forget === null) throw new Error('no key controls')
    expect(input.type).toBe('password')
    expect(forget.disabled).toBe(true)
    input.value = 'sk-ant-test'
    input.dispatchEvent(new Event('input'))
    expect(storage.map.get(API_KEY_KEY)).toBe('sk-ant-test')
    expect(forget.disabled).toBe(false)
    forget.click()
    expect(storage.map.has(API_KEY_KEY)).toBe(false)
    expect(input.value).toBe('')
    expect(forget.disabled).toBe(true)
  })

  it('shows a stored key on open', () => {
    const { q, settings } = setup({ [API_KEY_KEY]: 'sk-stored' })
    settings.open()
    expect(q<HTMLInputElement>('api-key')?.value).toBe('sk-stored')
  })

  it('resets to the bundled cards after confirmation', () => {
    const { q, store, confirm } = setup()
    store.commitScript('hello', '', { kind: 'edited', at: NOW.toISOString() })
    q<HTMLButtonElement>('reset-cards')?.click()
    expect(confirm).toHaveBeenCalledWith(RESET_CONFIRMATION)
    expect(store.getCard('hello')?.script).toBe(seedCards(NOW)[0]?.script)
    expect(store.getCard('hello')?.scriptOrigin).toEqual({ kind: 'seed' })
  })

  it('does not reset when the confirmation is declined', () => {
    const { q, store } = setup({}, false)
    store.commitScript('hello', '', { kind: 'edited', at: NOW.toISOString() })
    q<HTMLButtonElement>('reset-cards')?.click()
    expect(store.getCard('hello')?.script).toBe('')
  })
})
