# Demo recording checklist (three minutes)

Exact clicks for the video, what to say at each step, and the spec section each step
demonstrates. Run against the production bundle:

```bash
npm run build
```

```bash
npm run preview
```

Open `http://localhost:4173/` in a fresh browser profile (or clear this site's local
storage) so the six bundled cards are seeded and the offline provider is selected
(requirement 4.1). Keep the browser's network panel open and empty: it stays empty for the
whole demo except step 0.

| # | Time | Do | Say | Demonstrates |
|---|---|---|---|---|
| 0 | 0:00 | Load `http://localhost:4173/`. Point at the header: **Hello**, *Card 1 of 6*. The greeting field reads `Hello, world!`. | "HyperCard Reborn. Six cards, seeded on first load, no server, no key. The card is already running: its stored script put that greeting there." | `design.md` §7.1; requirement 4.1 |
| 1 | 0:15 | Press **Flip**. | "Every card flips. Left: the English the author wrote. Right: the script that actually runs. That `<pre>` is the stored script, byte for byte: no trim, no highlighter, same string the interpreter executes." | Requirements 2.1, 2.2; `design.md` §7.4 |
| 2 | 0:30 | Press **Flip** again. Press **Next** to **Counter**, press **Increment** three times (field reads `3`). | "Flipping back changes nothing: the card was never torn down. Buttons send `mouseUp` to the stored script and nothing else." | Requirement 2.3, 1.2 |
| 3 | 0:50 | **Next** to **Date stamp**: the field is hidden. Press **Stamp**: today's date appears. **Next** to **Greeter**: press **Greet** (dialog `Please enter your name.`, OK), type a name, press **Greet** again (dialog `Hello, <name>!`, OK). | "Visibility, dialogs, field text: all host effects go through one interface the interpreter talks to. No model is consulted for any of this." | Requirement 1.3; `design.md` §5.1, §5.5 |
| 4 | 1:10 | **Next** to **Countdown**: press **Go**. **Next** to **Quiz**: type `4`, press **Check**: `Correct!`, press **OK**: the app goes to card 2. Press **Next** four times back to **Quiz**. | "`go to card` is deferred until the dialog closes, so what you see is exactly the order the script asked for." | `design.md` §5.5 |
| 5 | 1:30 | Flip the Quiz card. Press the **Counter** chip under the description, press **Save**. The origin line reads *compiled offline at …*, the stored script on the right is now the counter script. Flip back: the status line reports `field "count" does not exist`. Flip again, press the **Quiz** chip, **Save**: the quiz script is back; flip back and it runs cleanly. | "Save is the one place the compiler is called: once per press, and the result is parsed before it is stored. Offline, the compiler knows these six descriptions. The same code path, with your own Anthropic key, calls `claude-haiku-5-5` once with structured output." | Requirement 1.1, 4.2; `design.md` §6.1, §6.3 |
| 6 | 2:00 | On the back of the Quiz card, in the **Draft** editor, change `if field "answer" = 4 then` to `= 5`. Press **Commit** (or Ctrl/Cmd+Enter). Flip back. Type `5`, press **Check**: `Correct!`. Press **OK** (card 2), navigate back to card 6. | "Edit the script and the card re-runs immediately. The model is not in the loop: this is our parser and our interpreter, and what you edited is what runs." | Requirements 3.1, 3.2, 3.3 |
| 7 | 2:25 | Flip the Quiz card. In the Draft, delete the line `end if` that closes the inner `if`. Press **Commit**. | "A script that does not parse is refused: the error is next to the editor with its line and column, the draft is kept so you can fix it, and the stored script on the right is untouched and still running." Flip back and press **Check** with `5` to prove it. | Requirement 3.4; `design.md` §8, §9 |
| 8 | 2:45 | Type an unknown description (for example `Make the card purple.`) on the back of any card, press **Save**. | "The offline compiler says what it can and cannot do, in a sentence that names the next step. The previous script is still running." Point at the empty network panel: "Zero requests since the page loaded. The isolation test in Playwright asserts exactly that." | Requirement 1.4, 4.3; `design.md` §9, §10 |
| 9 | 2:55 | Open **Settings**, show the provider radio and the key field, close it. | "Bring your own key here if you want the real compiler; it is stored in this browser only and sent only to the Anthropic API." | `design.md` §6.4, §6.6 |

Timing guide: steps 0 to 2 are the hook, 3 and 4 show the runtime, 5 to 8 are the point of
the spec (compile once, flip, edit-and-rerun, parse error kept safe, no network), 9 is the
closer.

## Run-through log

The checklist was executed once against `npm run preview` with `scripts/demo-run.mjs`, a
Playwright script that performs every click above in order and asserts each expected text
and a zero request count after load. It completed without deviation (it also caught and
fixed one wrong click count in an earlier draft of step 2). To repeat it:

```bash
npm run build
```

```bash
npm run preview
```

```bash
node scripts/demo-run.mjs
```
