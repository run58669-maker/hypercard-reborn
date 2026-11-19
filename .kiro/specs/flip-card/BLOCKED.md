# Blocked or partially verified sub-tasks

Sub-tasks that could not be completed are listed here with the reason, per the
execution instructions. Sub-tasks whose deliverable is complete but one named
verification step could not be run in the execution environment are listed under
"Partially verified" so a reviewer can run that step themselves.

## Partially verified

### 1.5 CI

- Deliverable: `.github/workflows/ci.yml` is written (Node 22, `npm ci`, `lint`,
  `typecheck`, `test`, `build`, `npx playwright install --with-deps chromium`,
  `test:e2e`, on push and pull request).
- Verified: the file parses as YAML and its `run` steps match the scripts in
  `package.json` one for one (checked with a PyYAML script).
- Not verified: `actionlint`. The execution environment denied both
  `npx actionlint` and a local `npm install actionlint`, and Docker is not
  available, so the actionlint run named in the "Done when" line was not
  performed. Run `npx actionlint .github/workflows/ci.yml` locally to close it.

## Notes on "Done when" wording

### 12.3 Compile flow end-to-end (offline)

- The task text says that after compiling the `counter` description on the
  `hello` card "the front face now has a working Increment button". Card
  layouts are fixed by `design.md` §3.2 (layout editing is a non-goal in §12),
  and the hello card has only a `greeting` field, so no button can appear
  there. `e2e/compile.spec.ts` therefore proves the compiled counter script is
  stored and running on the hello card through its visible runtime error
  (`field "count" does not exist`), and proves the working Increment button by
  compiling the same description on the counter card after blanking its script.
