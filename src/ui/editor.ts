// The script editor (design.md §8): a draft of the stored script, an
// explicit Commit (button or Ctrl/Cmd+Enter), never a commit on blur. On a
// successful commit the store notifies the card view, which re-runs the card
// immediately; on a parse error the panel shows it, the offending line is
// selected in the draft, and the draft is kept. This module never imports
// the compile service (requirement 3.3).
import type { ParseError } from '../parser'
import type { CardStore } from '../store'
import { el } from './dom'
import { createErrorPanel } from './errorPanel'

export interface EditorDeps {
  readonly store: CardStore
  readonly cardId: string
  readonly now?: () => Date
}

export type CommitOutcome =
  | { readonly kind: 'committed' }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'rejected'; readonly error: ParseError }
  /** Storage refused the write; the stored script and the draft are as they were (requirement 8.2). */
  | { readonly kind: 'not-saved' }

/** Shown next to the editor when storage refuses a Commit (design.md §9). */
export const COMMIT_NOT_SAVED =
  "The script was not saved: the browser's storage is full or unavailable. The card still runs the stored script, and your draft is kept here."

export interface Editor {
  readonly element: HTMLElement
  /** The current draft text. */
  draft(): string
  /** Replaces the draft (used when a Save compiles a new script). */
  setDraft(script: string): void
  /** Commits the draft: no-op when it equals the stored script. */
  commit(): CommitOutcome
}

export function createEditor(deps: EditorDeps): Editor {
  const now = deps.now ?? (() => new Date())
  const stored = (): string => deps.store.getCard(deps.cardId)?.script ?? ''

  const textarea = el('textarea', {
    class: 'script-editor',
    testid: 'script-editor',
    rows: 12,
    spellcheck: false,
    ariaLabel: 'Draft script',
    value: stored(),
  })
  const commitButton = el('button', { testid: 'commit-script', text: 'Commit', title: 'Commit the draft (Ctrl+Enter or Cmd+Enter)' })
  const panel = createErrorPanel('parse-error', 'Parse error')
  const notSaved = el('p', { class: 'error-panel', testid: 'commit-error', hidden: true })
  notSaved.setAttribute('role', 'alert')
  const element = el('div', { class: 'editor' }, [
    el('div', { class: 'editor-heading' }, [el('h3', { text: 'Draft' }), commitButton]),
    textarea,
    panel.element,
    notSaved,
  ])

  function clearNotSaved(): void {
    notSaved.textContent = ''
    notSaved.hidden = true
  }

  function selectLine(line: number): void {
    const lines = textarea.value.split(/\r\n|\n/)
    let start = 0
    for (let i = 0; i < line - 1 && i < lines.length; i += 1) {
      start += (lines[i] ?? '').length
      // Re-find the newline length in the original text.
      const rest = textarea.value.slice(start)
      start += rest.startsWith('\r\n') ? 2 : 1
    }
    const length = lines[line - 1]?.length ?? 0
    textarea.focus()
    textarea.setSelectionRange(start, start + length)
    textarea.dataset['errorLine'] = String(line)
  }

  const editor: Editor = {
    element,
    draft: () => textarea.value,
    setDraft(script) {
      textarea.value = script
      panel.clear()
      clearNotSaved()
      delete textarea.dataset['errorLine']
    },
    commit() {
      const draft = textarea.value
      clearNotSaved()
      if (draft === stored()) {
        panel.clear()
        delete textarea.dataset['errorLine']
        return { kind: 'unchanged' }
      }
      const result = deps.store.commitScript(deps.cardId, draft, { kind: 'edited', at: now().toISOString() })
      if (result.ok) {
        panel.clear()
        delete textarea.dataset['errorLine']
        return { kind: 'committed' }
      }
      if (result.reason === 'storage') {
        panel.clear()
        delete textarea.dataset['errorLine']
        notSaved.textContent = COMMIT_NOT_SAVED
        notSaved.hidden = false
        return { kind: 'not-saved' }
      }
      panel.show(result.error)
      selectLine(result.error.line)
      return { kind: 'rejected', error: result.error }
    },
  }

  commitButton.addEventListener('click', () => {
    editor.commit()
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      editor.commit()
    }
  })
  return editor
}
