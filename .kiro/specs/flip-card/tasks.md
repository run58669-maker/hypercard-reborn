# Implementation Plan: Flip Card

Tasks are ordered so that each one is testable on its own and the app is demoable after
task 13. Property tests use [fast-check](https://fast-check.dev/) under Vitest. Every
task that touches `src/parser/` triggers the parser-tests hook; every task that touches
`docs/grammar.md` or `src/examples/` triggers the grammar-consistency hook.

- [ ] 1. Scaffold the project
  - Vite + TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, fast-check, ESLint, Playwright.
  - `npm run dev | build | test | test:e2e | lint | typecheck` scripts.
  - ESLint `no-restricted-imports` rules from `design.md` §10 (interpreter/runtime/store/parser may not import `compile` or `@anthropic-ai/sdk`).
  - A placeholder `index.html` that renders "HyperCard Reborn" so `build` and `test:e2e` have something to hit.
  - _Requirements: 1.3_

- [ ] 2. AST types and lexer
  - `src/parser/ast.ts`: `Program` (with `source: string`), `Handler`, statement and expression node types matching `docs/grammar.md` §2-§4.
  - `src/parser/lexer.ts`: tokens with `line`/`column`, case-insensitive keywords, `--` comments, `\n` and `\r\n` newlines, strings without escapes.
  - Unit tests for each token class and for comment/newline handling.
  - Property test: the concatenation of all token `text` values plus skipped trivia reproduces the input exactly (lossless lexing).
  - _Requirements: 1.4, 3.4_

- [ ] 3. Parser: handlers and statements
  - Recursive descent for `on`/`end` handlers, `put`, `set`, `get`, `answer`, `go to card`, `show`, `hide`, both `if` forms, all four `repeat` heads including `down to`.
  - Reject a duplicate handler name and a mismatched `end`.
  - `parse()` returns `ParseResult` and never throws; `program.source` is the exact input string (reference equality asserted in a test).
  - _Requirements: 1.2, 1.4, 2.2, 3.4_

- [ ] 4. Parser: expressions
  - Precedence climbing for `or`, `and`, `not`, comparisons (`= <> < > <= >= is`, `is not`), `&`/`&&`, `+ -`, `* / div mod`, unary minus, parentheses, constants (`true false empty quote return`), `the date|time|target`, `field "x"`, `button "x"`, identifiers.
  - Unit tests with a table of (source, expected AST) pairs including every precedence boundary.
  - _Requirements: 1.4_

- [ ] 5. Parser: errors, printer and property tests
  - `ParseError { line, column, message, near }` with *expected X, found Y* messages; a snapshot test over 20 malformed scripts to freeze the messages.
  - `src/parser/printer.ts`: canonical pretty-printer.
  - Property tests with fast-check: (a) `parse(s)` never throws for arbitrary strings; (b) for an `Arbitrary<Program>` generator, `parse(print(p))` is structurally equal to `p`; (c) `parse(print(parse(s).program)).program` equals `parse(s).program` for every example script.
  - _Requirements: 1.4, 3.4_

- [ ] 6. Interpreter: values, expressions and built-ins
  - `src/interpreter/values.ts`: string values, numeric coercion, 6-decimal rendering, comparison rules from `docs/grammar.md` §4.
  - `src/interpreter/host.ts`: the `Host` interface from `design.md` §5 and an in-memory `FakeHost` for tests.
  - Expression evaluator including `the date`, `the time`, `the target`, `field "x"`, `button "x"`.
  - Property tests: for generated arithmetic expressions over small integers, the interpreter's result equals a reference evaluation in JS; `a & b` has length `len(a)+len(b)`; `a && b` equals `a + " " + b`.
  - _Requirements: 1.2_

- [ ] 7. Interpreter: statements, control flow and limits
  - `run(program, handler, host, { target })` with handler lookup, local variables, `it`, `put`/`set`/`get`, `if`, all `repeat` forms, `answer`, `go to card` (deferred), `show`/`hide`.
  - Statement budget of 10,000 and the `script ran too long` runtime error; missing handler is a no-op.
  - Runtime errors are returned, never thrown; the `FakeHost` records every call so tests can assert exact side-effect sequences.
  - Run all six examples against the `FakeHost` and assert the expected field contents and dialogs.
  - _Requirements: 1.2, 1.3_

- [ ] 8. Card store with the commitScript invariant
  - `src/store/types.ts` and `src/store/cardStore.ts` per `design.md` §3: `getCards`, `getCard`, `saveDescription`, `commitScript`, `subscribe`.
  - `commitScript` parses first and returns `{ok:false, error, card}` without mutating on failure; `saveDescription` never touches `script`.
  - `src/store/persistence.ts`: `localStorage['hcr.cards.v1']` load/save with a schema check; seeds the six example cards on first load.
  - Property tests: (a) for arbitrary strings, after `commitScript` the stored `script` is either unchanged (parse failed) or `===` the input; (b) `JSON.parse(JSON.stringify(card)).script` is byte-equal (`TextEncoder`) to `card.script` for arbitrary unicode strings; (c) `saveDescription` leaves `script` unchanged for arbitrary inputs.
  - _Requirements: 1.1, 1.4, 2.2, 3.2, 3.4_

- [ ] 9. Bundled examples and the grammar consistency test
  - `src/examples/index.ts` exporting the six `{id, title, description, script}` records from `docs/grammar.md` §8, scripts copied byte-for-byte.
  - `src/examples/consistency.test.ts`: reads `docs/grammar.md`, extracts each `### Example N` heading, description and `hypertalk` block, and asserts id, description and script match `src/examples/` exactly; asserts every example parses; asserts the EBNF block's statement and built-in keywords all appear in the lexer's keyword table.
  - _Requirements: 1.1, 1.4_

- [ ] 10. Compile service and the canned provider
  - `src/compile/compileService.ts`: `compile(description, provider, signal)` makes exactly one provider call, parses the candidate, returns `CompileResult` per `design.md` §6.1; it never imports the store.
  - `src/compile/providers/canned.ts`: normalised exact match against `src/examples/`; `NoCannedMatch` on miss.
  - Tests: one provider call per `compile` (spy count is 1, also when the provider throws); invalid candidate yields `invalid-script` with the parse error and the candidate; every bundled description compiles to its own script through the canned provider; whitespace and case variants of a description still hit.
  - _Requirements: 1.1, 1.4_

- [ ] 11. Anthropic provider (BYOK) and the compile prompt
  - `src/compile/prompt.ts`: system prompt from `docs/grammar.md?raw` plus the examples plus the rule block; snapshot-tested.
  - `src/compile/providers/anthropic.ts`: key from `localStorage['hcr.anthropicApiKey']`, `new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })`, `messages.parse` on `claude-haiku-5-5` with `max_tokens: 2048` and structured output `{ script: string }`, 30 s timeout, response checks (`refusal`, `max_tokens`, null parse) and error mapping from `design.md` §6.4.
  - Tests with the SDK mocked at the `fetch` boundary: missing key → `auth`; 401 → `auth`; 429 → `rate-limit`; network failure → `network`; `stop_reason: refusal` → `refused`; a well-formed response returns the script; the request body contains the model id, no `temperature`, no `fallbacks`, and exactly one user message.
  - _Requirements: 1.1, 1.4_

- [ ] 12. Front face and card runtime
  - `src/runtime/cardRuntime.ts`: parse `card.script`, build a DOM-backed `Host` over the front face, seed live state from `card.objects`, send `openCard`, route button clicks to `mouseUp` with `the target`, apply deferred `goToCard`, expose `currentProgram(id)`.
  - `src/ui/frontFace.ts`: render fields and buttons from `objects`, the status line for runtime errors, the Flip control. `src/ui/dom.ts` helpers; no framework.
  - Unit test: `currentProgram(id).source === getCard(id).script` for every seeded card after `run`.
  - _Requirements: 1.2, 1.3, 2.2_

- [ ] 13. Flip action and back face
  - `data-face` toggle with the CSS 3-D flip; both faces stay mounted.
  - `src/ui/backFace.ts`: description column and script column side by side (stacking below 720 px), read-only *Stored script* in a `<pre>` via `textContent`, script-origin line.
  - Dev-mode assertion that the rendered stored script `===` `currentProgram(id).source`.
  - Playwright: flip shows description and script; the `<pre>` `textContent` equals the stored script from `localStorage`; flip again returns to the front and does not re-run (field contents unchanged).
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 14. Script editor, commit and parse-error panel
  - `src/ui/editor.ts`: `draft` state initialised from `card.script` on flip, Commit button and Ctrl/Cmd+Enter, no commit on blur.
  - On commit: `store.commitScript(..., {kind:'edited'})`; success clears the error panel and calls `runtime.rerun(card)`; failure shows `line:column`, message and `near`, highlights the line, keeps the draft.
  - The editor module has no import of `src/compile/` (ESLint rule from task 1 covers it).
  - Playwright: edit the `hello` card to a new greeting, commit, flip back, see the new text without reloading; introduce a syntax error, commit, see the error next to the editor while the front face still shows the last valid result.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 15. Description panel, provider settings and the compile flow
  - `src/ui/settings.ts`: provider radio (`canned` default, `anthropic`), key entry with the local-storage notice and a Forget button; `localStorage['hcr.compileProvider']`, `localStorage['hcr.anthropicApiKey']`.
  - Description panel: editable description, Save (disabled while compiling), bundled-description chips when the provider is `canned`, the compile error block including the rejected candidate for `invalid-script`, the "compiled from an older description" notice when `descriptionHash` no longer matches.
  - `compile` is loaded with a dynamic `import()` so the SDK is in its own chunk.
  - Playwright (canned provider): pick a chip, Save, the front face runs the new script and the back face shows it; type an unknown description, Save, see the no-match error and the previous script still shown and still running.
  - _Requirements: 1.1, 1.4, 3.3_

- [ ] 16. Runtime isolation and byte-identity end-to-end tests
  - Playwright: load the app with the canned provider, run every seeded card and click every button, and assert via `page.on('request')` that no request leaves the page after the initial bundle load.
  - Playwright: for every seeded card, `textContent` of the stored-script `<pre>` equals `localStorage` `script` byte-for-byte (compare `TextEncoder` output in the page).
  - `vite build` plus a test that the `runtime`/`interpreter` chunk does not contain the string `anthropic`.
  - _Requirements: 1.2, 1.3, 2.2_

- [ ] 17. Polish and hand-off
  - README: replace the Kiro usage stub with the real commands; document BYOK and the local-storage key trade-off; add a 60-second demo script using the six bundled cards.
  - CI workflow: `lint`, `typecheck`, `test`, `build`, `test:e2e` on push.
  - Re-read `requirements.md` against the Playwright suite and list every acceptance criterion next to the test that covers it in `docs/traceability.md`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_
