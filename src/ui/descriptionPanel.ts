// The description panel (design.md §6.1, §7.2, §9): the editable description
// with Save, one-click chips for the six bundled descriptions when the
// offline provider is active (only those whose script fits this card's
// objects are enabled, §6.8), the compile-error block (with the rejected
// candidate for invalid-script and unknown-object), the stale-description notice and the
// script-origin line. Save is the only action that invokes the compile
// service, exactly once per press; it is disabled while a compile is in
// flight so a double click cannot start a second call.
import { EXAMPLES } from '../examples'
import type { Card, CardStore, ScriptOrigin } from '../store'
import type { Compiler, LoadCompiler } from './compiler'
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

/** Shown when storage refuses the description of a Save (design.md §9, requirement 8.3). */
export const DESCRIPTION_NOT_SAVED =
  "The description was not saved: the browser's storage is full or unavailable. Nothing was compiled, and your text is kept here."

/** Shown when the description was stored and storage refuses the script compiled from it (requirement 8.3). */
export const SCRIPT_NOT_SAVED =
  "The compiled script was not saved: the browser's storage is full or unavailable. The previous script is still running."

/** Shown when the card was committed or reset while its description was compiling (requirement 8.5). */
export const SAVE_OVERTAKEN =
  'The card changed while this description was compiling, so the compiled script was not stored. Press Save to compile it again.'

/** The title of a chip whose script names objects the rendered card lacks (design.md §6.8). */
export function unfitChipTitle(exampleTitle: string): string {
  return `Needs objects this card does not have. Open the ${exampleTitle} card to use it.`
}

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

  // Chips are built once and kept; fitChips() only flips `disabled` and
  // `title`. A chip starts disabled, so it never fills the description while
  // its fit for the rendered card is unknown.
  let chipButtons: { readonly example: (typeof EXAMPLES)[number]; readonly button: HTMLButtonElement }[] = []
  let compilerForChips: Compiler | null = null

  /** Enables exactly the chips whose script has no missing object on the rendered card. */
  function fitChips(compiler: Compiler): void {
    const objects = renderedCard?.objects ?? []
    for (const { example, button } of chipButtons) {
      const fits = compiler.missingObjects(example.script, objects).length === 0
      button.disabled = !fits
      button.title = fits ? example.description : unfitChipTitle(example.title)
    }
  }

  function renderChips(): void {
    if (deps.provider() !== 'canned') {
      chipButtons = []
      setChildren(chips, [])
      return
    }
    if (chipButtons.length === 0) {
      chipButtons = EXAMPLES.map((example) => {
        const button = el('button', { class: 'chip', testid: `chip-${example.id}`, text: example.title, title: example.description })
        button.disabled = true
        button.addEventListener('click', () => {
          if (button.disabled) return
          input.value = example.description
          input.focus()
        })
        return { example, button }
      })
      setChildren(chips, [el('span', { class: 'chips-label', text: 'Bundled descriptions:' }), ...chipButtons.map((chip) => chip.button)])
    }
    if (compilerForChips !== null) {
      fitChips(compilerForChips)
      return
    }
    void deps.loadCompiler().then(
      (compiler) => {
        compilerForChips = compiler
        fitChips(compiler)
      },
      () => {
        // Without the compile module Save cannot work either and says so; the chips stay disabled.
      },
    )
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
      // Set when the description did not reach the store: the input then keeps what was typed.
      let keepInput = false
      try {
        if (!deps.store.saveDescription(deps.cardId, description).ok) {
          keepInput = true
          showError(DESCRIPTION_NOT_SAVED, null)
          return
        }
        // The card as this Save left it. A Commit or a Reset replaces the object (design.md §6.1).
        const saved = deps.store.getCard(deps.cardId)
        const compiler = await deps.loadCompiler()
        const objects = deps.store.getCard(deps.cardId)?.objects ?? []
        const result = await compiler.compile(description, deps.provider(), { objects }, new AbortController().signal)
        if (!result.ok) {
          const rejected = result.error.kind === 'invalid-script' || result.error.kind === 'unknown-object' ? result.error.candidate : null
          showError(result.error.message, rejected)
          return
        }
        if (deps.store.getCard(deps.cardId) !== saved) {
          showError(SAVE_OVERTAKEN, null)
          return
        }
        const origin: ScriptOrigin =
          result.model === undefined
            ? { kind: 'compiled', provider: result.provider, descriptionHash: result.descriptionHash, at: now().toISOString() }
            : { kind: 'compiled', provider: result.provider, model: result.model, descriptionHash: result.descriptionHash, at: now().toISOString() }
        const committed = deps.store.commitScript(deps.cardId, result.script, origin)
        if (!committed.ok && committed.reason === 'storage') {
          showError(SCRIPT_NOT_SAVED, null)
        } else if (!committed.ok) {
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
        if (card !== undefined) {
          panel.render(card)
          if (keepInput) input.value = description
        }
      }
    },
  }

  save.addEventListener('click', () => {
    void panel.save()
  })
  renderChips()
  return panel
}
