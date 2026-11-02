// The description panel (design.md §6.1, §7.2, §9): the editable description
// with Save, one-click chips for the six bundled descriptions when the
// offline provider is active, the compile-error block (with the rejected
// candidate for invalid-script), the stale-description notice and the
// script-origin line. Save is the only action that invokes the compile
// service, exactly once per press; it is disabled while a compile is in
// flight so a double click cannot start a second call.
import { EXAMPLES } from '../examples'
import type { Card, CardStore, ScriptOrigin } from '../store'
import type { LoadCompiler } from './compiler'
import { el, setChildren } from './dom'
import type { ProviderChoice } from './settings'

export interface DescriptionPanelDeps {
  readonly store: CardStore
  readonly cardId: string
  readonly provider: () => ProviderChoice
  readonly loadCompiler: LoadCompiler
  readonly now?: () => Date
}

export interface DescriptionPanel {
  readonly element: HTMLElement
  /** Renders the card snapshot: description, chips, origin, stale notice. */
  render(card: Card): void
  /** Saves and compiles the description; resolves when the flow has settled. */
  save(): Promise<void>
  compiling(): boolean
}

export const STALE_NOTICE = 'The stored script was compiled from an older description. Press Save to compile this one.'

/** The script-origin line texts from design.md §7.2. */
export function originText(origin: ScriptOrigin): string {
  switch (origin.kind) {
    case 'seed':
      return 'bundled example'
    case 'edited':
      return `edited by hand at ${formatTime(origin.at)}`
    case 'compiled':
      return origin.provider === 'anthropic'
        ? `compiled from this description with Anthropic ${origin.model ?? ''} at ${formatTime(origin.at)}`.replace('  ', ' ')
        : `compiled offline at ${formatTime(origin.at)}`
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export function createDescriptionPanel(deps: DescriptionPanelDeps): DescriptionPanel {
  const now = deps.now ?? (() => new Date())
  const input = el('textarea', { class: 'description-input', testid: 'description-input', rows: 6, ariaLabel: 'Description' })
  const save = el('button', { testid: 'save-description', text: 'Save', title: 'Save the description and compile it into a script' })
  const status = el('p', { class: 'compile-status', testid: 'compile-status', ariaLabel: 'Compile status' })
  const chips = el('div', { class: 'chips', ariaLabel: 'Bundled descriptions' })
  const compileError = el('div', { class: 'error-panel', testid: 'compile-error', hidden: true })
  compileError.setAttribute('role', 'alert')
  const stale = el('p', { class: 'stale-notice', testid: 'stale-notice', text: STALE_NOTICE, hidden: true })
  const origin = el('p', { class: 'script-origin', testid: 'script-origin' })
  const element = el('div', { class: 'description-panel' }, [
    el('div', { class: 'editor-heading' }, [el('h3', { text: 'Description' }), save]),
    input,
    chips,
    status,
    compileError,
    stale,
    origin,
  ])

  let inFlight = false
  let renderedCard: Card | null = null

  function renderChips(): void {
    if (deps.provider() !== 'canned') {
      setChildren(chips, [])
      return
    }
    setChildren(chips, [
      el('span', { class: 'chips-label', text: 'Bundled descriptions:' }),
      ...EXAMPLES.map((example) => {
        const chip = el('button', { class: 'chip', testid: `chip-${example.id}`, text: example.title, title: example.description })
        chip.addEventListener('click', () => {
          input.value = example.description
          input.focus()
        })
        return chip
      }),
    ])
  }

  function showError(message: string, candidate: string | null): void {
    setChildren(compileError, [
      el('p', { text: message }),
      candidate === null ? null : el('p', { class: 'candidate-label', text: 'The rejected script, for reference (copy it into the editor to fix it):' }),
      candidate === null ? null : el('pre', { class: 'stored-script compile-candidate', testid: 'compile-candidate', text: candidate }),
    ])
    compileError.hidden = false
  }

  function clearError(): void {
    compileError.replaceChildren()
    compileError.hidden = true
  }

  async function refreshStale(card: Card): Promise<void> {
    if (card.scriptOrigin.kind !== 'compiled') {
      stale.hidden = true
      return
    }
    const expected = card.scriptOrigin.descriptionHash
    try {
      const compiler = await deps.loadCompiler()
      const actual = await compiler.descriptionHash(card.description)
      // Only apply if this is still the rendered snapshot.
      if (renderedCard === card) stale.hidden = actual === expected
    } catch {
      stale.hidden = true
    }
  }

  const panel: DescriptionPanel = {
    element,
    compiling: () => inFlight,
    render(card) {
      renderedCard = card
      if (!inFlight) input.value = card.description
      origin.textContent = originText(card.scriptOrigin)
      renderChips()
      void refreshStale(card)
    },
    async save() {
      if (inFlight) return
      inFlight = true
      save.disabled = true
      status.textContent = 'Compiling…'
      clearError()
      const description = input.value
      try {
        deps.store.saveDescription(deps.cardId, description)
        const compiler = await deps.loadCompiler()
        const result = await compiler.compile(description, deps.provider(), new AbortController().signal)
        if (!result.ok) {
          showError(result.error.message, result.error.kind === 'invalid-script' ? result.error.candidate : null)
          return
        }
        const origin: ScriptOrigin =
          result.model === undefined
            ? { kind: 'compiled', provider: result.provider, descriptionHash: result.descriptionHash, at: now().toISOString() }
            : { kind: 'compiled', provider: result.provider, model: result.model, descriptionHash: result.descriptionHash, at: now().toISOString() }
        const committed = deps.store.commitScript(deps.cardId, result.script, origin)
        if (!committed.ok) {
          // Cannot happen (the service parsed the script), but never swallow it.
          showError(
            `The compiler produced a script that does not parse (line ${String(committed.error.line)}, column ${String(committed.error.column)}: ${committed.error.message}). The previous script is still running.`,
            result.script,
          )
        }
      } catch (error) {
        showError(`Compiling failed for an unexpected reason: ${error instanceof Error ? error.message : String(error)}.`, null)
      } finally {
        inFlight = false
        save.disabled = false
        status.textContent = ''
        const card = deps.store.getCard(deps.cardId)
        if (card !== undefined) panel.render(card)
      }
    },
  }

  save.addEventListener('click', () => {
    void panel.save()
  })
  renderChips()
  return panel
}
