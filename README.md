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
- `.kiro/specs/flip-card/requirements.md`, `design.md`, `tasks.md` for the spec
- `docs/grammar.md` for the language and the six example cards

## Running (stub)

The commands below are the contract the implementation tasks will fulfil. None of them work yet.

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

## Working with Kiro (stub)

- Steering files in `.kiro/steering/` are loaded into every Kiro session.
- The spec lives in `.kiro/specs/flip-card/`. Open `tasks.md` in Kiro and run tasks in order; each task lists the acceptance criteria it covers.
- Hooks in `.kiro/hooks/`:
  - `parser-tests.kiro.hook` runs the parser tests (including property tests) when anything under `src/parser/` changes.
  - `grammar-examples-consistency.kiro.hook` keeps `docs/grammar.md`, `src/examples/` and the compile prompt in agreement.

## License

MIT, see `LICENSE`.
