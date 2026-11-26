# Requirements: Flip Card

## Introduction

Scope: the flip action only. A card holds a natural-language description and the HyperTalk-subset script compiled from it. The runtime executes only the stored script via our own interpreter.

### Glossary

- **Card**: one unit of the stack, with a description, a stored script and a set of fields and buttons.
- **Stored script**: the exact string held in `Card.script`; the only thing the runtime executes.
- **Run**: reset the card's live field text and visibility from its layout, then send `openCard` to the stored script.
- **The LLM** / **compile provider**: whatever turns a description into a script on Save. The offline provider that serves the six bundled descriptions counts as a compile provider for every criterion below, so the pipeline is identical with and without a key.
- **Flip**: toggle a card between its front face (the running card) and its back face (description and script side by side).
- **Commit**: the explicit action (button or keyboard shortcut) that submits an edited script.

## Requirement 1: Compile once, run the stored script

**User story:** As a card author, I want my natural-language description compiled once into a script stored on the card, so that what runs is deterministic and inspectable.

### Acceptance criteria

1. WHEN the author saves a natural-language description on a card, THE system SHALL call the LLM exactly once to compile it into a HyperTalk-subset script and SHALL store that script on the card.
2. WHEN a card runs, THE runtime SHALL execute only the stored script using the project's own interpreter.
3. WHILE a card is running, THE runtime SHALL NOT call the LLM.
4. IF the compiled output is not valid HyperTalk-subset syntax, THEN THE system SHALL reject it, keep the previous script, and show the parse error.

## Requirement 2: Flip shows NL and script side by side

**User story:** As a viewer, I want to flip any card to see the description and the script that actually runs.

### Acceptance criteria

1. WHEN the user triggers the flip action on a card, THE system SHALL show the card's natural-language description and its stored script side by side.
2. THE script shown on the flipped card SHALL be byte-identical to the script the runtime executes.
3. WHEN the user triggers the flip action again, THE system SHALL return to the card's front face.

## Requirement 3: Edit the script, card re-runs immediately

**User story:** As a card author, I want to edit the script on the flipped card and see the card re-run right away.

### Acceptance criteria

1. WHILE the card is flipped, THE system SHALL allow the user to edit the stored script.
2. WHEN the user commits a valid script edit, THE system SHALL store the edited script on the card and re-run the card immediately.
3. WHEN the user edits the script directly, THE system SHALL NOT call the LLM.
4. IF the edited script fails to parse, THEN THE system SHALL keep the last valid script running and show the parse error next to the editor.

## Requirement 4: Offline by default, no network at runtime

**User story:** As a demo viewer, I want the app to work with no key and no network, so that what I see running is provably the stored script and nothing else.

### Acceptance criteria

1. WHEN the app is loaded for the first time in a browser, THE system SHALL seed the six bundled example cards and select the offline compile provider, with no key required.
2. WHILE the offline provider is selected, WHEN the author saves one of the six bundled descriptions, THE system SHALL compile it to its bundled script without any network request.
3. WHILE any card is running or being flipped, THE system SHALL make no network request of any kind.

## Requirement 5: Keyboard access to the stack and the flip

**User story:** As a viewer, I want to move between cards and get back to the front of a card from the keyboard, so that I can walk the stack without reaching for the mouse.

Added after the first build (2026-11-19). Tasks 16.x implement it. Criteria 6 and 7 came from the review of tasks 16.1 and 16.2 the same day.

### Acceptance criteria

1. WHEN the user presses the Right Arrow key, THE system SHALL show the next card exactly as the Next button does, and SHALL do nothing on the last card.
2. WHEN the user presses the Left Arrow key, THE system SHALL show the previous card exactly as the Previous button does, and SHALL do nothing on the first card.
3. WHILE focus is in an editable element (a field, the description, the script draft, the API key), THE system SHALL NOT change cards on an arrow key, so the key moves the text cursor as usual.
4. WHILE the card's back face, the settings panel or an answer dialog is showing, or while Alt, Ctrl, Meta or Shift is held, THE system SHALL NOT change cards on an arrow key.
5. WHEN the user presses Escape while the card's back face is showing and neither the settings panel nor an answer dialog is open, THE system SHALL return to the front face as the flip action does, without re-running the card.
6. WHEN the card turns to its front face while focus is inside the back face, THE system SHALL move focus to the Flip button, so keys typed next do not edit the hidden script draft.
7. WHILE an input method is composing text, THE system SHALL NOT act on an arrow key or Escape, so the key reaches the input method as usual.

## Requirement 6: A compiled script only refers to objects the card has

**User story:** As a card author, I want a description that talks about fields or buttons this card lacks to be refused when I save it, so that the card never ends up storing a script that fails the moment it runs.

Added 2026-11-24 after a review found that saving the Counter description on the Hello card stored a script whose `openCard` fails with `field "count" does not exist`. A card's fields and buttons are fixed by its layout; compiling does not add or remove them. Tasks 17.x implement it.

### Acceptance criteria

1. IF the compiled output parses but refers, as `field "<name>"` or `button "<name>"`, to an object the card does not have, THEN THE system SHALL reject it, keep the previous script, and show a message that names each missing object and lists the objects the card has.
2. WHEN the system decides whether a card has an object, THE system SHALL match kind and name exactly as the runtime does when the script runs, so a script accepted here cannot fail at run time with `does not exist`.
3. WHILE the offline provider is selected, THE system SHALL enable the one-click chip of a bundled description only if its bundled script passes criterion 1 on the card being shown, and SHALL show every other chip disabled with a title naming the card that description belongs to.
4. WHEN the system compiles a description with the Anthropic provider, THE request SHALL list the kind and name of every object on the card.

## Requirement 7: A script cannot trap the stack

**User story:** As someone trying the stack, I want a script that keeps sending the stack from card to card, floods me with dialogs, or is nested absurdly deep, to be stopped with a message, so that a bad script never leaves me with a page I can neither use nor repair.

Added 2026-11-26. A review read the code and suspected two traps; both were then reproduced. With `on openCard`, `go to card 1`, `end openCard` stored on card 1, showing card 1 threw `RangeError: Maximum call stack size exceeded`, and so did two cards that send the stack to each other. Scripts are persisted, so a reload hit the same error. `parse` threw the same error for parentheses nested 1000 deep, for 20000 unary minus signs and for 3000 nested `if` blocks, although `design.md` §4.1 says it never throws. Tasks 18.x implement it.

Revised the same day, after a second review (another model, reading the code and the first draft of this requirement). It found four holes in the draft: committing a looping script would have re-run the card without end; the nesting count missed chains whose left operand is nested; a card whose stored script does not parse could not be repaired without a reload; and `repeat forever` around `answer` queues about 5,000 dialogs. Criteria 7.1, 7.2 and 7.4 changed, and 7.6 and 7.7 are new.

A **user action** below is anything the person does that makes a card run or a handler fire: the first card shown on page load, Previous and Next, the arrow keys, a click on a card button, committing a script, a Save that compiles a new script, resetting the stack. Pressing OK on an `answer` dialog is not one: the dialog was put there by the script. Flipping is not one either: it never runs the card (requirement 2.3).

### Acceptance criteria

1. IF a card's `openCard` handler asks to go to a card and, since the last user action, either the same card's `openCard` has already moved the stack on or the `openCard` handlers of 16 cards have, THEN THE system SHALL not move, SHALL leave that card showing, and SHALL show `Stopped: openCard scripts kept sending the stack from card to card. Flip the card to fix its script.` in the status line. Nothing in this path throws, and the user action that started it returns.
2. WHILE that message is showing, and equally after a reload with the same scripts stored, THE system SHALL keep Flip, Previous, Next and the script editor working. WHEN a script that no longer loops is committed, THE system SHALL run the card normally and clear the message; WHEN a script that loops is committed, THE system SHALL stop it as in 7.1.
3. WHEN neither condition of 7.1 holds (a button sends the stack to card 2, whose `openCard` sends it on to card 3; or a button on card 1 sends it to card 2, whose `openCard` sends it back to card 1), THE system SHALL perform every move. Each user action starts the count afresh.
4. IF a script nests more than 64 levels, THEN `parse` SHALL return the parse error `expression too long or nested too deeply (limit 64)` positioned at the token that would open level 65, and SHALL NOT throw. Levels are counted while parsing, so that no path through the tree of a script that parses is longer than 64 (parentheses are counted too, although they leave no node in the tree): `(`, `not`, unary `-` and an enclosing block `if` or `repeat` each add one level to what they contain, and each operator applied in a chain adds one level above its operands (`a & b & c` is two levels). A script that reaches exactly 64 levels parses.
5. WHEN a script parses, THE system SHALL be able to run each of its handlers, print it and collect its object references without throwing, however the 64 levels are spent.
6. IF one run of a handler executes `answer` more than 10 times, THEN THE system SHALL stop the handler at the eleventh with the runtime error `too many answer dialogs (limit 10)`, so that a loop around `answer` cannot keep the person from reaching Flip.
7. WHEN the card showing has a stored script that does not parse (for example one saved before a limit existed) and a script that parses is committed on its back, THE system SHALL run the card with the new script, without a reload.
8. WHEN a move asked for by an `openCard` handler has been performed, THE system SHALL show, outside the card, a notice with one button for each card whose `openCard` has moved the stack on since the last user action, except the card that is showing. WHEN such a button is pressed, THE system SHALL show that card on its back with its objects rendered and its buttons working, SHALL NOT run its `openCard` handler, and SHALL say so in the status line, so that a card whose script sends the stack away can still be opened and changed. IF that card's stored script does not parse, THEN the system shows the stored-script message of 7.7 instead and keeps the editor available. Pressing the button is a user action. The notice is removed by the next move the user makes; a script that then moves the stack on brings a new one.
9. IF the expressions of one run of a handler do more than 1,000,000 units of work, THEN THE system SHALL stop the handler with the runtime error `script ran too long` at the expression that would go over. Every expression node evaluated is one unit, and every value an expression yields adds one unit per 256 UTF-16 code units of its length. Every value an expression yields, wherever it is used, is at most 65,536 UTF-16 code units long; a longer one is the runtime error `value too long`. The statement budget of 10,000 stays as it is.

Criterion 7.9 was added on 2026-11-26 after the same reviews. The statement budget counts statements, and one statement may hold an expression of thousands of nodes: `repeat 9999 times` around such a statement stayed inside the budget and kept the page busy for a long time, again at every opening of the card. The 64 KiB limit was checked only where `&`, `&&`, arithmetic and `put` produce a value, so a literal handed to `answer`, `get` or `set name`, or a long field read, passed it.

Criterion 7.8 was added on 2026-11-26 after the reviews of the implementation of 7.1 to 7.7. One reviewer (another model) showed that a card whose `openCard` moves the stack on once never trips 7.1 and could not be opened at all, which also cut off the cards behind it.

## Requirement 8: A change that could not be stored is not shown as made

**User story:** As a card author, I want a Commit, a Save or a Reset that the browser could not store to leave the card as it was and to say so, and a Save that answers late not to undo what I did while it was compiling, so that the page never shows a script that a reload would take away.

Added 2026-11-27. Task 18.6 listed both cases as open. With the browser's storage full, a Commit changed the card in memory, re-ran it and showed the new script as stored, while the write to `localStorage` had thrown: after a reload the old script was back. And a Save whose compile answered after the author had committed a script by hand, or reset the stack, stored the compiled script over it. Tasks 19.x implement it.

A write is **refused** below when `localStorage.setItem` throws for the cards key, whatever the reason: the quota is used up, or the browser denies storage to the page.

### Acceptance criteria

1. IF the write is refused when a script is committed, a description is saved or the stack is reset, THEN THE system SHALL leave every card as it was before the action, in memory as in storage, SHALL NOT re-run any card, and SHALL report the action to its caller as not saved.
2. WHEN a Commit is reported as not saved, THE system SHALL show `The script was not saved: the browser's storage is full or unavailable. The card still runs the stored script, and your draft is kept here.` next to the editor and SHALL keep the draft as typed.
3. WHEN the description of a Save is reported as not saved, THE system SHALL show `The description was not saved: the browser's storage is full or unavailable. Nothing was compiled, and your text is kept here.` in the description panel, SHALL keep the description as typed and SHALL NOT call the compile provider. WHEN the description was stored and the script compiled from it is reported as not saved, THE system SHALL show `The compiled script was not saved: the browser's storage is full or unavailable. The previous script is still running.` there.
4. WHEN a Reset is reported as not saved, THE system SHALL show `The cards were not reset: the browser's storage is full or unavailable.` beside the Reset button.
5. IF a script is committed on a card, or the stack is reset, after a Save of that card started compiling and before the compile answers, THEN THE system SHALL NOT store the script that Save compiled, SHALL leave the script committed or restored in the meantime stored and running, and SHALL show `The card changed while this description was compiling, so the compiled script was not stored. Press Save to compile it again.` in the description panel.
