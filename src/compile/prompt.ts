// The compile prompt (design.md §6.5): the grammar document verbatim, the
// six bundled examples, and a short rule block. `buildSystemPrompt` is pure
// and snapshot-tested; `SYSTEM_PROMPT` is what the Anthropic provider sends.
import grammar from '../../docs/grammar.md?raw'
import { EXAMPLES, type Example } from '../examples'

const RULES = [
  'You compile a card author\'s natural-language description into a script in the HyperTalk subset defined above.',
  'Output only the script. No prose, no code fences, no explanation.',
  'Use only the handlers, statements, operators and built-ins the grammar defines. Anything else is a parse error and the script will be rejected.',
  'Reference fields and buttons by exactly the names the description gives them.',
  'If the description asks for something the grammar cannot express, implement the closest thing it can express. Do not invent syntax.',
  'Put behaviour that happens when the card opens in `on openCard`; put behaviour for button clicks in `on mouseUp` and test `the target` against the button name.',
].join('\n')

export function buildSystemPrompt(grammarText: string, examples: readonly Example[]): string {
  const rendered = examples.map((example) => `Description: ${example.description}\n\n${example.script}`).join('\n')
  return [
    '# Language',
    '',
    grammarText.trimEnd(),
    '',
    '# Examples',
    '',
    'Each example is a description a card author typed, followed by the script to produce for it.',
    '',
    rendered.trimEnd(),
    '',
    '# Rules',
    '',
    RULES,
    '',
  ].join('\n')
}

export const SYSTEM_PROMPT: string = buildSystemPrompt(grammar, EXAMPLES)
