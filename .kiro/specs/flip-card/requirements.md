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
