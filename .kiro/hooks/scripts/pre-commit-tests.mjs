#!/usr/bin/env node
// Pre-tool-use hook script for .kiro/hooks/pre-commit-tests.kiro.hook.
//
// Kiro passes the tool event (tool name and input) as JSON on stdin. This script
// looks for a `git commit` in the shell command about to run. If it finds one, it
// runs `npm test` and exits with code 2 when the suite fails, which tells Kiro to
// block the tool call. Any other command passes through with exit code 0.
//
// Belt and braces: task 1.4 in tasks.md also installs a plain git pre-commit hook
// (`.githooks/pre-commit`, enabled via `core.hooksPath`) so a commit made from a
// terminal outside Kiro runs the same suite. If this script receives no stdin at
// all (older IDE builds did not pass tool context to runCommand hooks), it cannot
// tell what is about to run and lets the call through, leaving the git hook as
// the guard. It prints a one-line note in that case so the gap is visible.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const raw = readStdin();
if (raw.trim() === '') {
  console.log('[pre-commit-tests] no tool input on stdin; relying on .githooks/pre-commit.');
  process.exit(0);
}

let commandText = raw;
try {
  const event = JSON.parse(raw);
  const input = event.tool_input ?? event.toolInput ?? event.input ?? event;
  commandText = typeof input === 'string' ? input : JSON.stringify(input);
} catch {
  // Not JSON: search the raw text.
}

// Matches `git commit`, `git -c x=y commit`, `git commit -am`, but not `git log`.
const isCommit = /\bgit\b(?:\s+-[-\w=.:/]+|\s+--?\S+(?:\s+\S+)?)*\s+commit\b/.test(commandText);
if (!isCommit) process.exit(0);

console.log('[pre-commit-tests] git commit detected; running npm test first.');
const result = spawnSync('npm', ['test', '--', '--run'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) {
  console.error('[pre-commit-tests] npm test failed; commit blocked. Fix the tests, do not skip them.');
  process.exit(2);
}
console.log('[pre-commit-tests] tests passed; commit allowed.');
process.exit(0);
