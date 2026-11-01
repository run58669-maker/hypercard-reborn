# HyperCard Reborn

Kiroween 2026 · Resurrection · HyperCard reborn — every card can be flipped to show the script that actually runs.

## Pitch

In 1987 HyperCard let anyone build software by describing what a button should do, in
something close to English, and the stack ran exactly what you wrote. HyperCard Reborn
brings that promise to the browser with one twist: you write the description in actual
English, an LLM compiles it **once** into a tiny HyperTalk-subset script, and that script
is stored on the card. From then on the model is out of the loop. The card runs on our
own interpreter, in your browser, with no server and no network.

Flip any card and you see both halves side by side: the sentence you wrote and the script
that runs. The script is editable. Commit an edit and the card re-runs immediately. The
model is never consulted for an edit, and the script you see is byte-for-byte the script
that executes.

Hackathon scope is the flip action and nothing else: the flip-card view, the compile-once
pipeline (bring-your-own Anthropic key, or an offline canned compiler for the six bundled
cards), and edit-and-rerun.

## Status

Specification complete, implementation not started. See:

- `.kiro/steering/product.md` and `.kiro/steering/tech.md` for scope and stack rules
- `.kiro/specs/flip-card/requirements.md`, `design.md`, `tasks.md` for the spec, and `examples/` for the six bundled cards
- `docs/REVIEW.md` for the judge-style self-review and the fixes it led to
- `docs/grammar.md` for the language and the six example cards

## Running

The commands below are the contract the implementation tasks fulfil (task 1.1 onward). Until task 1 is executed, none of them work yet.

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest unit + fast-check property tests
npm run test:e2e   # Playwright against vite preview
npm run build      # static bundle in dist/, runs with no backend
```

Compile providers:

- **Offline (default):** the six bundled descriptions in `docs/grammar.md` compile with no key and no network.
- **Anthropic (BYOK):** paste your own API key in Settings. It is stored in this browser's
  `localStorage`, read only when you press Save on a description, and sent only to
  `api.anthropic.com`. The app calls `claude-haiku-5-5` from the browser, which means the
  key is visible to the page: use a personal key on a personal machine.

## Working with Kiro

This project is spec-driven: the `.kiro/` directory is the product, the code is what
Kiro produces from it. `.kiro/steering/kiro-usage.md` is the long version; this is the short one.

**Spec** (`.kiro/specs/flip-card/`)

| File | What it holds |
|---|---|
| `requirements.md` | 4 requirements, 14 EARS acceptance criteria, a glossary that fixes the contested words (*run*, *the LLM*, *commit*). |
| `design.md` | Module boundaries, the one invariant (`Card.script` is the only executable artefact), every public type, every parse and runtime error message, the six seeded card layouts, the `data-testid` contract, assumptions taken where the requirements leave room. |
| `tasks.md` | 14 groups, 47 sub-tasks, each sized for one Kiro execution with a *Done when* line and the `_Requirements_` it serves. Open the spec in Kiro and run them in order. |
| `examples/<id>.hc/` | The six bundled cards as `description.txt` + `script.hc`, byte-identical to `docs/grammar.md` §8. The app imports these files directly. |

`docs/grammar.md` is the language definition everything derives from: the parser
implements it, the compile prompt embeds it, the examples are checked against it.

**Hooks** (`.kiro/hooks/`)

| Hook | Fires on | Does |
|---|---|---|
| `parser-tests.kiro.hook` | edit under `src/parser/` | runs the parser unit + fast-check property tests, fixes without weakening tests, checks the grammar still matches |
| `grammar-examples-consistency.kiro.hook` | edit to `docs/grammar.md`, the spec examples, `src/examples/`, the compile prompt | keeps the four byte-for-byte in agreement, reports EBNF vs lexer drift |
| `pre-commit-tests.kiro.hook` | any shell command (`preToolUse`) | if the command is a `git commit`, runs `npm test` first and blocks the commit on failure (exit code 2) |

**Steering** (`.kiro/steering/`)

- `product.md` (always): the scope, one paragraph.
- `tech.md` (always): stack, ESLint-enforced module boundaries, invariants, Claude API rules.
- `kiro-usage.md` (always): the workflow, what is property-tested, what was deliberately not vibe-coded.
- `testing.md` (`fileMatch` on test files): fast-check and Playwright conventions.

**Property-based testing.** Every invariant in `tech.md` has a fast-check property named
in `tasks.md`: `parse()` never throws, lossless lexing, print/parse round trip, byte
identity through the store and the runtime, arithmetic against a reference evaluator.

**Not vibe-coded.** The grammar, the six examples, the error messages, the single
compile call and the no-LLM-at-runtime guarantee were written and reviewed by hand in the
spec first. Kiro implements them; the hooks and tests hold it to the spec.

## License

MIT, see `LICENSE`.
