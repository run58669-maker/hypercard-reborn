# Judge review: HyperCard Reborn (branch `cloud/spec-design`)

Reviewer stance: a strict Kiroween 2026 judge reading every file on the branch as it
stood at commit `7c95a1a` (spec only, no implementation). Scores are 1–5 per criterion,
each with three concrete reasons, followed by the prioritised fix list. The second half
of this document records which fixes were applied in this session and which remain for
the implementation.

## Scores (as submitted, before this session's fixes)

| Criterion | Score | One-line verdict |
|---|---|---|
| Potential impact | 3 | A sharp, honest idea ("the script you see is the script that runs") with a deliberately tiny scope; impact depends entirely on a demo that does not exist yet. |
| Technological implementation (use of Kiro) | 3 | Specs, hooks and steering all present and above-average in quality, but two hooks only, no `fileMatch` steering, no visible experimentation, and tasks too coarse for Kiro to execute one at a time. |
| Design | 2 | The product experience is described, not built. Several interactions a user would hit (multi-card navigation, dialogs, what a field is) were undefined, so "complete, coherent product" could not be claimed. |
| Innovation / idea | 4 | Compile-once-then-freeze plus a flippable card is a real stance against "AI in the loop" apps, and the byte-identity guarantee is a crisp, testable thesis. |
| Presentation | 3 | README pitch is good and the mermaid diagrams help; the Kiro section was a stub and nothing shows the judge how Kiro was actually used. |

### Potential impact: 3

1. The thesis is legible in one sentence and solves a real trust problem with LLM-built software: the model proposes, a deterministic interpreter disposes, and the user can read what runs. That is a durable idea beyond the hackathon.
2. Scope is the flip action only. That is the right hackathon discipline, but it means the impact of the submission is a demo of one interaction, and nothing on the branch runs yet.
3. The language is small enough to be learnable from one page, which is what gives HyperCard-style tools their reach; `docs/grammar.md` §9 shows the authors know what they left out and why.

### Technological implementation (use of Kiro): 3

1. The spec is genuinely three-phase: EARS requirements, a design that argues from the requirements, and tasks that cite them. The `tech.md` module-boundary table and the "invariants every change must keep" list are the kind of steering that actually changes what an agent writes.
2. The two hooks are well-aimed (parser tests on parser edits; grammar/examples/prompt consistency) and their prompts tell the agent what *not* to do (no weakening tests, no editing acceptance criteria). That is deeper hook usage than most submissions.
3. Gaps a judge will notice: no hook gates commits; no `fileMatch` or `manual` steering, so no evidence the author knows inclusion modes; no steering file explains the Kiro workflow itself; `tasks.md` has 17 tasks of which at least five (11, 12, 15, 16, 17) are multi-session efforts with no explicit done-criteria, so Kiro could not execute "one task" reliably.

### Design: 2

1. Interactions were undefined: how the user reaches card 2 (the quiz script navigates there, the design said "single-card stack"), what `answer` looks like and whether it blocks, whether a field is a `<textarea>` the user can type in (the greeter and quiz cards require it), what the seeded cards' layouts are at all.
2. `design.md` referenced types it never defined (`CompileResult`, `CompileError`, the `RuntimeError` shape) and left the grammar with real holes: a script without a trailing newline did not parse by the EBNF, blank or comment lines inside a handler were not allowed, `is not` and the two `if` forms were ambiguous, "numeric" was undefined.
3. Error wording, which the UI shows verbatim and tests snapshot, was listed for only four of roughly ten runtime situations and for none of the compile errors except one.

### Innovation / idea: 4

1. "Compile once, then the model is out of the loop" is a position, not a feature, and the design enforces it structurally (ESLint boundaries, a build-chunk check, a Playwright request counter) rather than by promise.
2. Making the flip reveal the *stored* script and proving byte identity with `TextEncoder` turns a UI flourish into the product's proof of honesty.
3. The offline canned provider is a smart hackathon move: the whole pipeline, including requirement 1.3, is demonstrable with no key and no network.

### Presentation: 3

1. The README pitch lands the idea in three paragraphs and the sequence diagrams make the compile and edit flows easy to follow.
2. "Working with Kiro (stub)" is the section a Kiroween judge reads first, and it was a stub.
3. There was no self-review, no traceability from criteria to tests, and nothing a judge could open to see the six cards without reading a grammar document.

## Prioritised fixes

Ordered by judge impact divided by effort. **S** = spec-level, done in this session.
**I** = needs implementation (left to Kiro via `tasks.md`).

1. **S** Make `tasks.md` executable one sub-task at a time: 14 groups, 47 sub-tasks, each with files, a *Done when* line and `_Requirements_`.
2. **S** Resolve the grammar holes (end-of-input newline, blank/comment lines in handlers, `is not`, single-line `if` body, numeric definition, `div`/`mod`, loop counter semantics, object renaming, `enabled` on fields).
3. **S** Define every public type the tasks cite (`CompileResult`, `CompileError`, `RunResult`, `RuntimeError`, `StoreChange`, `Host` with rename/enable) and every parse, runtime and compile error message.
4. **S** Define the product shell: one card at a time, header navigation, run-on-show, dialog queue then deferred `go to card`, six seeded layouts, fields are editable textareas, a `data-testid` contract for Playwright.
5. **S** Add the machine-readable examples (`.kiro/specs/flip-card/examples/<id>.hc/`) extracted byte-exactly from `docs/grammar.md`, and make `src/examples` import them so there is no third copy.
6. **S** Add a third hook that runs `npm test` before any commit (`preToolUse` on the shell tool, `runCommand`, exit 2 blocks), with a plain-git twin scheduled in task 1.4.
7. **S** Add `kiro-usage.md` (always) and `testing.md` (`fileMatch`) steering, so the workflow and the inclusion modes are both visible.
8. **S** Add Requirement 4 (offline by default, no network at runtime) and a glossary so "run", "the LLM" and "commit" are no longer open questions.
9. **S** Make the README's Kiro section real and link this review.
10. **I** Execute tasks 1–9 first; the app is only credible once the parser property tests and the FakeHost example runs are green.
11. **I** Verify the Anthropic SDK field names in `design.md` §6.4 against the installed SDK (task 8.3) and record the version.
12. **I** Produce `docs/traceability.md` (task 14.2) and the demo checklist (task 14.3); a judge should be able to map every criterion to a test and every claim to a click.

## What this session changed

| File | Change |
|---|---|
| `.kiro/specs/flip-card/requirements.md` | Glossary; Requirement 4 (4.1–4.3). Existing criteria untouched. |
| `.kiro/specs/flip-card/design.md` | Rewritten: fixed module table, full type definitions, seeded layouts, parse/runtime/compile error tables, dialog and navigation semantics, app shell, `data-testid` contract, example extraction rule, assumptions list. |
| `.kiro/specs/flip-card/tasks.md` | Rewritten into 47 one-execution sub-tasks with done-criteria and requirement refs. |
| `.kiro/specs/flip-card/examples/` | Six `<id>.hc/description.txt` + `script.hc` pairs, extracted by script from `docs/grammar.md` and diffed back byte-for-byte; a README with the rule. |
| `docs/grammar.md` | Semantics tightened (see fix 2); §8 now names the examples directory. Example text unchanged. |
| `.kiro/hooks/pre-commit-tests.kiro.hook`, `.kiro/hooks/scripts/pre-commit-tests.mjs` | New hook and its script. |
| `.kiro/hooks/grammar-examples-consistency.kiro.hook` | Patterns include the examples directory; prompt names the extraction rule and forbids editing examples to make tests pass. |
| `.kiro/steering/kiro-usage.md`, `.kiro/steering/testing.md` | New steering (always / fileMatch). |
| `README.md` | Kiro section rewritten; status links this review. |

## Expected scores after the fixes, if `tasks.md` is executed as written

| Criterion | Before | After spec fixes | After implementation |
|---|---|---|---|
| Potential impact | 3 | 3 | 4 |
| Technological implementation | 3 | 4 | 5 |
| Design | 2 | 3 | 4 |
| Innovation | 4 | 4 | 4 |
| Presentation | 3 | 4 | 4–5 (demo video and traceability pending) |

## Remaining risks

1. **The pre-commit hook depends on Kiro passing the tool input on stdin to `runCommand` hooks.** The community-documented schema and the IDE's exit-code blocking support this, but kiro.dev was unreachable from this session so the field names (`toolTypes`, stdin shape) could not be verified against the official page. The script degrades to "allow and warn" when stdin is empty, and task 1.4 installs a plain git hook as the backstop. Verify in the IDE on the first commit.
2. **Anthropic SDK surface.** `messages.parse`, `output_config.format`, `zodOutputFormat`, `stop_reason: 'refusal'` and the `claude-haiku-5-5` model id are taken from `tech.md` and were not checked against the installed SDK here. Task 8.3 makes that check explicit; a rename there is a design update, not a silent code change.
3. **Nothing on the branch runs.** Every score above the "before" column is conditional on Kiro executing 47 sub-tasks faithfully, with the hooks holding the grammar, examples and prompt together. The first green run of task 4.5 (all six examples against the FakeHost) is the moment the submission becomes real.
