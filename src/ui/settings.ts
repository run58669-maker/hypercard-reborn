// Settings panel (design.md §6.4, §6.6): compile provider radio (offline by
// default), the Anthropic key with its local-storage notice, Forget key, and
// Reset to bundled cards. Switching provider never touches any script.
import type { CardStore, StorageLike } from '../store'
import { el } from './dom'

export const PROVIDER_KEY = 'hcr.compileProvider'
export const API_KEY_KEY = 'hcr.anthropicApiKey'

export type ProviderChoice = 'canned' | 'anthropic'

/** The stored provider choice; anything but 'anthropic' means offline. */
export function readProvider(storage: StorageLike): ProviderChoice {
  try {
    return storage.getItem(PROVIDER_KEY) === 'anthropic' ? 'anthropic' : 'canned'
  } catch {
    return 'canned'
  }
}

export interface SettingsDeps {
  readonly store: CardStore
  readonly storage: StorageLike
  /** Confirmation for Reset; defaults to window.confirm. */
  readonly confirm?: (message: string) => boolean
  /** Called when the provider choice changes. */
  readonly onProviderChange?: (provider: ProviderChoice) => void
}

export interface Settings {
  readonly element: HTMLDialogElement
  open(): void
  close(): void
  provider(): ProviderChoice
}

export const RESET_CONFIRMATION = 'Replace every card with the six bundled examples? Edited scripts and descriptions will be lost.'

export function createSettings(deps: SettingsDeps): Settings {
  const confirm = deps.confirm ?? ((message: string) => window.confirm(message))

  const canned = el('input', { type: 'radio', name: 'provider', value: 'canned', testid: 'provider-canned', id: 'provider-canned' })
  const anthropic = el('input', { type: 'radio', name: 'provider', value: 'anthropic', testid: 'provider-anthropic', id: 'provider-anthropic' })
  const keyInput = el('input', { type: 'password', testid: 'api-key', id: 'api-key', placeholder: 'sk-ant-…', ariaLabel: 'Anthropic API key' })
  keyInput.autocomplete = 'off'
  const forget = el('button', { testid: 'forget-key', text: 'Forget key' })
  const reset = el('button', { testid: 'reset-cards', text: 'Reset to bundled cards' })
  const close = el('button', { testid: 'settings-close', text: 'Close' })

  const element = el('dialog', { class: 'settings', testid: 'settings-panel', ariaLabel: 'Settings' }, [
    el('h2', { text: 'Settings' }),
    el('fieldset', { class: 'settings-group' }, [
      el('legend', { text: 'Compile with' }),
      el('label', { for: 'provider-canned' }, [canned, ' Offline (bundled examples)']),
      el('label', { for: 'provider-anthropic' }, [anthropic, ' Anthropic (my key)']),
      el('p', { class: 'settings-note', text: 'Offline needs no key and no network: it knows the six bundled descriptions.' }),
    ]),
    el('fieldset', { class: 'settings-group' }, [
      el('legend', { text: 'Anthropic API key' }),
      el('label', { for: 'api-key', text: 'Key' }),
      keyInput,
      forget,
      el('p', {
        class: 'settings-note',
        text: 'The key is stored in this browser\'s local storage, read only when you press Save on a description, and sent only to api.anthropic.com. A browser-held key is only appropriate for a personal key on a personal machine.',
      }),
    ]),
    el('fieldset', { class: 'settings-group' }, [el('legend', { text: 'Cards' }), reset]),
    el('div', { class: 'settings-actions' }, [close]),
  ])

  function syncFromStorage(): void {
    const provider = readProvider(deps.storage)
    canned.checked = provider === 'canned'
    anthropic.checked = provider === 'anthropic'
    let key: string | null
    try {
      key = deps.storage.getItem(API_KEY_KEY)
    } catch {
      key = null
    }
    keyInput.value = key ?? ''
    forget.disabled = key === null || key === ''
  }

  function setProvider(provider: ProviderChoice): void {
    deps.storage.setItem(PROVIDER_KEY, provider)
    syncFromStorage()
    deps.onProviderChange?.(provider)
  }

  canned.addEventListener('change', () => {
    if (canned.checked) setProvider('canned')
  })
  anthropic.addEventListener('change', () => {
    if (anthropic.checked) setProvider('anthropic')
  })
  keyInput.addEventListener('input', () => {
    if (keyInput.value === '') deps.storage.removeItem(API_KEY_KEY)
    else deps.storage.setItem(API_KEY_KEY, keyInput.value)
    forget.disabled = keyInput.value === ''
  })
  forget.addEventListener('click', () => {
    deps.storage.removeItem(API_KEY_KEY)
    syncFromStorage()
  })
  reset.addEventListener('click', () => {
    if (confirm(RESET_CONFIRMATION)) deps.store.resetToSeed()
  })

  const settings: Settings = {
    element,
    open() {
      syncFromStorage()
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    },
    close() {
      if (typeof element.close === 'function') element.close()
      else element.removeAttribute('open')
    },
    provider: () => readProvider(deps.storage),
  }
  close.addEventListener('click', () => {
    settings.close()
  })
  syncFromStorage()
  return settings
}
