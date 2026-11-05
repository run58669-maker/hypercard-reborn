---
inclusion: always
---

# How this project uses Kiro

This file is for the humans and the agent alike: it says which Kiro features carry
which part of the work, in what order, and what we chose not to leave to an open-ended
"vibe coding" session. Read it before executing anything from `tasks.md`.

## 1. Spec-driven, in this order

The whole product is one spec, `.kiro/specs/flip-card/`, built in the standard three
phases and never skipped ahead:

1. **`requirements.md`** came first, in EARS form (WHEN / WHILE / IF ... THE system SHALL).
   Four requirements, fourteen numbered acceptance criteria. Every later artefact points
   back at these numbers and nothing else counts as "done".
2. **`design.md`** was written against those criteria before any code. It fixes the module
   boundaries, the one invariant that makes the product honest (`Card.script` is the only
   executable artefact), every public type, every error message, the seeded card layouts,
   the `data-testid` contract the Playwright tests use, and an "open questions" list with
   the assumption taken for each. Where `requirements.md` was ambiguous we wrote the
   assumption down instead of guessing silently.
3. **`tasks.md`** breaks the design into tasks sized for one Kiro execution each. Each
   task names the files it touches, a *Done when* line that a reviewer can check without
   trusting the agent's summary, and the `_Requirements_` it serves. Tasks are executed
   from the Kiro spec view one at a time, in order, with the hooks below running
   automatically as files change.

`docs/grammar.md` is the fourth spec document in all but location: it is the language
definition the parser, the compile prompt and the examples all derive from, and the
spec's `examples/` directory is its machine-readable half.

## 2. Hooks (`.kiro/hooks/`)

| Hook | Trigger | What it does | Why it exists |
|---|---|---|---|
| `parser-tests.kiro.hook` | `fileEdited` on `src/parser/**/*.ts` | Runs the parser unit and fast-check property tests, fixes failures without weakening the tests, and checks `docs/grammar.md` still describes what the parser accepts. | The parser is the safety net for requirements 1.4 and 3.4; it must never silently drift from the grammar. |
| `grammar-examples-consistency.kiro.hook` | `fileEdited` on `docs/grammar.md`, the spec `examples/` directory, `src/examples/**`, `src/compile/prompt.ts` | Keeps the grammar, the six examples and the compile prompt byte-for-byte in agreement, and reports any construct that is in the EBNF but not the lexer or vice versa. | Three artefacts describe one language; a hook, not a reviewer, holds them together. |
| `pre-commit-tests.kiro.hook` | `preToolUse` on the shell tool | Inspects the command about to run; if it is a `git commit`, runs `npm test` first and blocks the commit (exit code 2) when anything fails. | No red commit ever reaches the branch, including commits the agent makes at the end of a task. |

Two hooks ask the agent (`askAgent`) because the fix needs judgement; the third runs a
command (`runCommand`) because a gate must not be negotiable. The pre-commit hook has a
plain-git twin (`.githooks/pre-commit`, installed by task 1.4) for commits made outside Kiro.

## 3. Steering (`.kiro/steering/`)

| File | Inclusion | Purpose |
|---|---|---|
| `product.md` | always | One paragraph of scope. Anything outside it is out of scope, full stop. |
| `tech.md` | always | Stack, module boundaries enforced by ESLint, invariants every change must keep, Claude API usage rules for the single compile call. |
| `kiro-usage.md` | always | This file: the workflow itself. |
| `testing.md` | `fileMatch` on `**/*.test.ts` and `e2e/**` | Property-test conventions (fast-check), what a property test must and must not do, how tests assert on error messages. Loaded only when a test file is open so it does not crowd the context otherwise. |

## 4. Property-based testing with fast-check

Unit tests check examples; property tests check the invariants the spec is built on.
Every invariant in `tech.md` has a property test named in `tasks.md`:

- `parse()` is total: arbitrary strings never throw (task 3.4).
- The lexer is lossless: tokens plus trivia reproduce the input (task 2.3).
- Print/parse round trip: for generated programs, `parse(print(p))` equals `p` (task 3.5).
- Byte identity: after `commitScript(id, s)`, the stored script and the running
  program's `source` are `===` to `s` and equal under `TextEncoder` (tasks 6.4, 9.3).
- Arithmetic agrees with a JS reference evaluator over generated expressions (task 4.3).
- `saveDescription` never changes `script` (task 6.4).

Rules: `numRuns` is never lowered to make a test pass; a failing property is a bug in the
code or in the spec, and the fix goes there. Shrunk counter-examples are added as named
unit tests so the regression is readable.

## 5. What was deliberately not vibe-coded

- **The grammar.** `docs/grammar.md` was written and reviewed by hand before any parser
  existed. The agent implements it; it does not extend it. Anything not in the document
  is a parse error by definition.
- **The byte-identity and no-LLM-at-runtime guarantees.** These are enforced by module
  boundaries (ESLint `no-restricted-imports`), a build-output test, and a Playwright test
  that counts network requests, not by a prompt asking the agent to be careful.
- **The compile call.** Exactly one provider call per Save, `maxRetries: 0`, structured
  output, and an explicit `stop_reason` branch. The agent was not allowed to "make it
  work" with retries or fence-stripping.
- **Error messages.** Parse and runtime messages are listed in the spec and frozen by
  snapshot tests, so the UI, the tests and the docs say the same thing.
- **The example cards.** Six descriptions and their scripts were written by a person,
  checked against the grammar by hand, and are the only thing the offline compiler knows.

What the agent *does* own: file layout inside the module boundaries, test scaffolding,
DOM helpers, CSS, and the exact wording of internal comments.

## 6. Day-to-day loop

1. Open the spec in Kiro, pick the next unchecked task, execute it.
2. Hooks run as files change; read what they report before moving on.
3. `npm test` must be green before a commit; the pre-commit hook enforces it.
4. Commit with `area: what changed`. Tick the task. Next task.
