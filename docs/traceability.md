# Traceability: acceptance criteria to tests

Every acceptance criterion in `.kiro/specs/flip-card/requirements.md` with the unit or
property test and the Playwright spec that covers it. Run one unit test alone with

```bash
npx vitest run <file> -t "<test name>"
```

and one Playwright test with

```bash
npx playwright test <file> -g "<test name>"
```

Test names below are the exact strings; `it.each` rows are named by their rendered title.

## Requirement 1: Compile once, run the stored script

| Criterion | Unit / property tests | Playwright |
|---|---|---|
| 1.1 Save calls the LLM exactly once and stores the script | `src/compile/compileService.test.ts` > `calls the provider exactly once and returns the parsed candidate with the description hash`, `calls the provider exactly once even when it throws`; `src/compile/providers/anthropic.test.ts` > `returns the script from a well-formed structured response with one fetch call`, `does not retry a 429 (maxRetries 0)`; `src/compile/providers/canned.test.ts` > `compiles the hello description to its own script byte for byte` (one row per example); `src/ui/descriptionPanel.test.ts` > `Save saves the description, compiles once, commits the script and re-runs the card`, `a double click produces one compile call` | `e2e/compile.spec.ts` > `compile offline: the counter chip turns the hello card into a counter; an unknown description keeps the previous script; no network` |
| 1.2 A running card executes only the stored script with our interpreter | `src/interpreter/examples.test.ts` > all eight tests (every bundled example against `FakeHost`); `src/interpreter/interpreter.test.ts` > `run` suite; `src/runtime/cardRuntime.test.ts` > `runs openCard on mount and exposes the program with source === card.script`, `clicks the counter button three times and the field reads 3`; `src/runtime/identity.test.ts` > `hello: currentProgram(id).source === getCard(id).script` (one per card) | `e2e/shell.spec.ts` > `shows card 1 of 6 running, and Next shows a working counter`, `the last card disables Next and the quiz navigates to card 2 after OK` |
| 1.3 No LLM call while a card runs | `scripts/check-boundaries.test.ts` > `reports an error when src/interpreter imports @anthropic-ai/sdk`, `reports an error when src/runtime imports src/compile`, `allows src/ui to load src/compile only through a dynamic import()`; `scripts/bundle-check.test.ts` > `the chunk containing the interpreter mentions neither anthropic nor api.anthropic.com`, `the entry chunk reaches the compile chunk only through a dynamic import` | `e2e/isolation.spec.ts` > `no request leaves the page while every card runs, is clicked and is flipped` |
| 1.4 Invalid compiled output is rejected, the previous script kept, the parse error shown | `src/compile/compileService.test.ts` > `returns invalid-script with the parse error and the candidate`; `src/compile/providers/anthropic.test.ts` > `returns invalid-script through the service when the structured script does not parse`, `hands the raw text to the service when the output is not valid structured output`; `src/store/cardStore.test.ts` > `leaves the card deep-equal to before and emits no change when the script does not parse`; `src/store/cardStore.properties.test.ts` > `(a) after commitScript the stored script is either unchanged or === the input`; `src/parser/errors.test.ts` > `parse errors` suite and `never throws on arbitrary strings`; `src/ui/descriptionPanel.test.ts` > `invalid-script shows the parse error and the rejected candidate; the previous script keeps running`, `no-canned-match shows the message and no candidate` | `e2e/compile.spec.ts` > `compile offline: the counter chip turns the hello card into a counter; an unknown description keeps the previous script; no network` |

## Requirement 2: Flip shows NL and script side by side

| Criterion | Unit / property tests | Playwright |
|---|---|---|
| 2.1 Flip shows description and stored script side by side | `src/ui/cardView.test.ts` > `mounts both faces, front first`, `flips to the back and the stored script textContent === card.script`; `src/ui/descriptionPanel.test.ts` > `shows the description, the chips for the offline provider and the origin line` | `e2e/flip.spec.ts` > `flip shows description and script side by side at 1280px and flips back without re-running`, `... at 600px ...` |
| 2.2 The shown script is byte-identical to the executed script | `src/runtime/identity.test.ts` > `hello: currentProgram(id).source === getCard(id).script` (one per card), `commitScript then rerun keeps the stored and the running script === the committed one` (property); `src/store/cardStore.properties.test.ts` > `(b) JSON round-trips the script byte for byte, lone surrogates included`; `src/ui/cardView.test.ts` > `re-runs the card on a committed script and shows it on the back face byte for byte, with its origin`; `src/parser/parser.test.ts` > `returns the source by reference`; `src/parser/lexer.test.ts` > `reproduces the input from trivia plus token text for every accepted string` (property) | `e2e/identity.spec.ts` > `the stored-script view is byte-identical to localStorage for all six cards`; `e2e/flip.spec.ts` (bytes compared inside the page) |
| 2.3 Flip again returns to the front | `src/ui/cardView.test.ts` > `flips back to the front without re-running the card` | `e2e/flip.spec.ts` > both tests (flip back, counter still `2`) |

## Requirement 3: Edit the script, card re-runs immediately

| Criterion | Unit / property tests | Playwright |
|---|---|---|
| 3.1 The flipped card lets the user edit the script | `src/ui/editor.test.ts` > `starts with a draft equal to the stored script and no error`, `does not commit on blur`, `keeps the draft across a flip to the front and back` | `e2e/editor.spec.ts` > `edit, commit, re-run, persist, and keep the last valid script on a parse error, with no network` |
| 3.2 Committing a valid edit stores it and re-runs the card immediately | `src/ui/editor.test.ts` > `commits a valid draft with the Commit button and stores it verbatim`, `commits with Ctrl+Enter and with Cmd+Enter, not with plain Enter`, `re-runs the card immediately on a successful commit and updates the stored view`; `src/runtime/cardRuntime.test.ts` > `rerun discards live field text and visibility and runs openCard again`, `rerun uses the new snapshot script`; `src/store/cardStore.test.ts` > `stores the script verbatim on success and notifies once`, `updates script, scriptOrigin and updatedAt, persists once, and keeps other fields` | `e2e/editor.spec.ts` > same test |
| 3.3 Editing the script never calls the LLM | `scripts/check-boundaries.test.ts` > `reports an error when src/runtime imports src/compile` (the editor and runtime cannot import the compile module; `src/ui/editor.ts` has no import of it); `src/ui/editor.test.ts` > `commit is a no-op when the draft equals the stored script` | `e2e/editor.spec.ts` > same test (zero requests after load across the whole flow) |
| 3.4 A failed edit keeps the last valid script running and shows the parse error next to the editor | `src/ui/editor.test.ts` > `shows the parse error next to the editor, selects the line and keeps the draft on failure`, `keeps the last valid script running when the draft fails to parse`, `clears the error after a later successful commit`; `src/store/cardStore.test.ts` > `leaves the card deep-equal to before and emits no change when the script does not parse`; `src/parser/errors.test.ts` > `parse errors` suite (frozen messages) | `e2e/editor.spec.ts` > same test |

## Requirement 4: Offline by default, no network at runtime

| Criterion | Unit / property tests | Playwright |
|---|---|---|
| 4.1 First load seeds the six cards and selects the offline provider | `src/store/persistence.test.ts` > `seeds six cards and writes the key when storage is empty`, `re-seeds and overwrites when the key holds not JSON` (and the other corrupt rows), `loads valid data unchanged`, `resetToSeed restores the bundled script after an edit and notifies`; `src/store/persistence.test.ts` > `builds the six bundled cards with kind seed and the example bytes`; `src/examples/index.test.ts` > `holds six records with the ids in stack order`; `src/ui/settings.test.ts` > `defaults to canned`, `has every control from design.md §7.3 and defaults to the offline provider`, `switching provider writes hcr.compileProvider and leaves every script unchanged` | `e2e/shell.spec.ts` > `shows card 1 of 6 running, and Next shows a working counter` (every spec starts from a cleared `localStorage`, so seeding runs each time) |
| 4.2 With the offline provider a bundled description compiles to its bundled script with no network | `src/compile/providers/canned.test.ts` > `compiles the <id> description to its own script byte for byte` (six rows), `still hits on a whitespace, case and trailing-dot variant`, `misses on an unknown description`; `src/examples/consistency.test.ts` > `example <id> is byte-identical to the spec examples directory`, `example <id> ships the same bytes`, `example <id> parses` | `e2e/compile.spec.ts` > both tests (zero requests after load) |
| 4.3 No network request while any card runs or is flipped | `scripts/bundle-check.test.ts` > `a separate chunk contains api.anthropic.com and that chunk has no interpreter marker` | `e2e/isolation.spec.ts` > `no request leaves the page while every card runs, is clicked and is flipped`; `e2e/editor.spec.ts` and `e2e/compile.spec.ts` (request counts) |

## Invariants from `tech.md`, for completeness

| Invariant | Test |
|---|---|
| `parse()` is total | `src/parser/errors.test.ts` > `never throws on arbitrary strings`, `never throws on strings glued together from grammar keywords` |
| The lexer is lossless | `src/parser/lexer.test.ts` > `reproduces the input from trivia plus token text for every accepted string` |
| Print/parse round trip | `src/parser/roundtrip.test.ts` > `round-trips generated programs through print and parse`, `round-trips the <id> example` |
| Arithmetic agrees with a reference evaluator | `src/interpreter/evaluate.test.ts` > `agrees with a JS reference evaluator on + - * div mod over integers` |
| Exactly one provider call per compile | `src/compile/compileService.test.ts` > `calls the provider exactly once ...` (both tests) |
| Runtime errors are returned values and never roll back the store | `src/interpreter/interpreter.test.ts` > `keeps side effects performed before the failing statement`, `runtime error messages (design.md §5.4)`; `src/runtime/cardRuntime.test.ts` > `writes runtime errors to the status line and reports them` |
| Grammar, examples and prompt agree | `src/examples/consistency.test.ts` (all), `src/compile/prompt.test.ts` > `matches the snapshot` |
