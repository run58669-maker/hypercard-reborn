---
inclusion: fileMatch
fileMatchPattern: ['**/*.test.ts', 'e2e/**']
---

# Testing conventions

## Unit tests (Vitest)

- One `describe` per exported function; test names are sentences ("rejects a duplicate handler").
- Tables of `(input, expected)` pairs use `it.each` so a new case is one line.
- Tests that assert on a parse or runtime error assert the **whole** `message` string
  against the wording in `design.md` §4.3 and §5.4. Never match on a substring.
- Snapshot tests exist only where the spec says so (parse-error messages, the compile
  prompt). A snapshot update needs a sentence in the commit message saying why.

## Property tests (fast-check)

- Live next to the unit tests, in the same file, under `describe('properties')`.
- Default `numRuns` is 200 for parser and store properties, 100 for interpreter
  properties. Do not lower a count to make a test pass; shrink the arbitrary instead.
- Every arbitrary that generates programs is defined once in `src/parser/arbitraries.ts`
  and reused; do not write a second generator in a test file.
- When a property fails, add the shrunk counter-example as a named unit test in the
  same file before fixing the code, so the regression is readable without fast-check.
- Properties must be deterministic: inject `now()` through the `Host`, never read the clock.

## End-to-end tests (Playwright, `e2e/`)

- Select elements only by the `data-testid` names listed in `design.md` §7.3.
- Each spec starts from a clean `localStorage` (`page.addInitScript` clears `hcr.*` keys)
  so seeding is exercised every time.
- Byte comparisons are done inside the page with `TextEncoder`, not with string equality
  in the test runner, so the test proves what the spec says ("byte-identical").
- The no-network test (task 13.1) counts requests with `page.on('request')` after
  `load`; any request at all is a failure, there is no allow-list.
