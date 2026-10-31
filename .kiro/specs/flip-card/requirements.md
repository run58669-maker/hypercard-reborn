# Requirements: Flip Card

## Introduction

Scope: the flip action only. A card holds a natural-language description and the HyperTalk-subset script compiled from it. The runtime executes only the stored script via our own interpreter.

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
