// Public surface of the interpreter module (design.md §2).
export { run, STATEMENT_BUDGET } from './interpreter'
export type { RunOptions, RunResult, RuntimeError } from './interpreter'
export type { Host, HostObject, ObjectKind } from './host'
export { formatDate, formatTime } from './evaluate'

/**
 * Marker for the bundle check (task 13.3): the built chunk that contains the
 * interpreter is found by this string and must not mention the Anthropic SDK.
 */
export const INTERPRETER_CHUNK_MARKER = 'hcr-interpreter-chunk-marker'
