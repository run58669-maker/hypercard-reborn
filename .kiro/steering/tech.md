# Tech

## Stack

- **Language:** TypeScript, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. No `any` outside test mocks.
- **Build / dev server:** Vite. Output is a static bundle in `dist/`; it must run from `file://` or any static host. There is no server, no API route, no serverless function.
- **UI:** plain DOM with small render helpers in `src/ui/dom.ts`. No UI framework for this scope. If the UI outgrows that, Preact is the agreed escape hatch; do not add React.
- **Tests:** Vitest for unit and property tests, fast-check for properties, Playwright for end-to-end against `vite preview`. Do not add Jest.
- **Lint:** ESLint with `@typescript-eslint` and `no-restricted-imports` to enforce the module boundaries below.
- **Runtime dependencies:** `@anthropic-ai/sdk` and `zod` (for the structured-output schema) only. Everything else is dev-only. Adding a runtime dependency needs a line in the PR explaining why the bundle must grow.
- **Node:** 22 LTS. `package-lock.json` is committed.

## Module boundaries (enforced by ESLint)

| Module | May import | May not import |
|---|---|---|
| `src/parser` | nothing from `src/` | anything |
| `src/interpreter` | `src/parser` | `src/compile`, `src/store`, `src/ui`, `@anthropic-ai/sdk` |
| `src/store` | `src/parser` | `src/compile`, `src/ui`, `src/interpreter`, `@anthropic-ai/sdk` |
| `src/runtime` | `src/parser`, `src/interpreter`, `src/store` | `src/compile`, `@anthropic-ai/sdk` |
| `src/compile` | `src/parser`, `src/examples`, `@anthropic-ai/sdk`, `zod` | `src/store`, `src/interpreter`, `src/ui`, `src/runtime` |
| `src/ui` | everything above | nothing is forbidden, but `src/compile` only via dynamic `import()` |

The reason: requirement 1.3 (no LLM call while a card runs) must be true by construction,
not by convention. `@anthropic-ai/sdk` is reachable from one file, `src/compile/providers/anthropic.ts`.

## Invariants every change must keep

1. `Card.script` is the only executable artefact. Only `CardStore.commitScript` writes it, and only after `parse()` succeeds.
2. Nothing normalises a script on the way in or out: no `trim()`, no line-ending conversion, no `innerHTML`. The displayed script and the running script are the same string.
3. `parse()` is total. It returns a result; it never throws.
4. The compile service makes exactly one provider call per invocation. No retry loops, SDK `maxRetries: 0`.
5. Runtime errors are returned values, not exceptions, and never roll back the store.

## Claude API usage (compile step only)

- Model `claude-haiku-5-5`, called from the browser with the user's own key via
  `new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })`.
- Structured output through `output_config.format` on `client.messages.create`, decoded with the
  format helper's `parse` after the `stop_reason` branch (SDK 1.3.0's `messages.parse` throws on a
  truncated body first; see `design.md` §6.4); no assistant prefill (rejected by this model).
- Leave `thinking` and `effort` at the model defaults; do not send `temperature`, `top_p`, `top_k` or `fallbacks` (all rejected or unsupported on this model).
- Always branch on `stop_reason` (`refusal`, `max_tokens`) before reading content.
- Catch SDK errors most-specific first: `AuthenticationError`, `RateLimitError`, `APIConnectionError`, then `APIError`.
- The key lives in `localStorage['hcr.anthropicApiKey']` and is read at call time. Never log it, never put it in a URL, never send it anywhere but the Anthropic API.

## Conventions

- File names `camelCase.ts`; one exported concept per file; tests next to the code as `*.test.ts`; Playwright specs in `e2e/`.
- Keys in `localStorage` are prefixed `hcr.` and versioned when they hold structured data (`hcr.cards.v1`).
- Error messages shown to users are complete sentences that name the next step.
- Commit messages: `area: what changed` (`parser: add down to`, `spec: ...`). No model names in commits.
- Keep `docs/grammar.md` as the single source of truth for the language. The parser, the examples and the compile prompt all derive from it, and the Kiro hooks hold them together.
