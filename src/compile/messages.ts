// Compile error messages, shown verbatim (design.md §9). Every message is a
// complete sentence naming the next step. Also the objects line the Anthropic
// provider appends to the user message (design.md §6.8).
import type { ParseError } from '../parser'
import type { ObjectName } from './objectCheck'

const written = (object: ObjectName): string => `${object.kind} "${object.name}"`
const list = (objects: readonly ObjectName[]): string => objects.map(written).join(', ')

/** One line telling the model which objects the card has. */
export function objectsLine(objects: readonly ObjectName[]): string {
  return objects.length === 0
    ? 'This card has no fields and no buttons.'
    : `This card has exactly these objects: ${list(objects)}. Do not refer to any other field or button.`
}

export const MESSAGES = {
  invalidScript: (error: ParseError): string =>
    `The compiler produced a script that does not parse (line ${String(error.line)}, column ${String(error.column)}: ${error.message}). The previous script is still running.`,
  unknownObject: (missing: readonly ObjectName[], objects: readonly ObjectName[]): string =>
    `The compiler produced a script for objects this card does not have (${list(missing)}). This card has: ${objects.length === 0 ? 'no fields and no buttons' : list(objects)}. The previous script is still running.`,
  noCannedMatch: 'The offline compiler only knows the six bundled descriptions. Pick one from the list, or add an Anthropic key in Settings.',
  authMissing: 'Add an Anthropic key in Settings to compile with Anthropic.',
  authRejected: 'Anthropic rejected the key. Check it in Settings.',
  rateLimit: 'Anthropic is rate-limiting this key. Wait a moment and press Save again.',
  network: 'Could not reach api.anthropic.com. Check the connection and press Save again.',
  refused: 'The model declined to compile this description. Rephrase it and press Save again.',
  truncated: "The model's answer was cut off. Shorten the description and press Save again.",
  api: (status: number): string => `Anthropic returned an error (HTTP ${String(status)}). Press Save to try again.`,
  unknown: (detail: string): string => `Compiling failed for an unexpected reason: ${detail}.`,
} as const
