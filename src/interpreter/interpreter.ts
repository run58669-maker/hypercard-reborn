// Tree-walking interpreter (design.md §5.2): runs one handler of a Program
// against a Host. Synchronous; runtime errors are returned, never thrown,
// and side effects already performed stay. A statement budget of 10,000
// keeps the UI responsive (grammar §7).
import type { HandlerName, IfStatement, Position, Program, RepeatStatement, Statement } from '../parser'
import { evaluate, type EvalContext } from './evaluate'
import type { Host } from './host'
import { checkLength, renderNumber, toBoolean, toNumber } from './values'

export const STATEMENT_BUDGET = 10_000

export interface RunOptions {
  /** The clicked button's name; '' for openCard. */
  readonly target: string
}

export interface RuntimeError {
  readonly message: string
  readonly line: number
  readonly column: number
  readonly handler: HandlerName
}

export type RunResult =
  | { readonly ok: true; readonly statements: number }
  | { readonly ok: false; readonly error: RuntimeError; readonly statements: number }

/** Internal signal: the handler stops at the failing statement. */
class Stop extends Error {
  constructor(readonly position: Position, override readonly message: string) {
    super(message)
  }
}

class Execution {
  statements = 0
  readonly context: EvalContext

  constructor(
    readonly host: Host,
    target: string,
  ) {
    this.context = { host, variables: new Map(), target }
  }

  /** Charges one statement to the budget; stops the run when it is spent. */
  charge(node: Position): void {
    if (this.statements >= STATEMENT_BUDGET) throw new Stop(node, 'script ran too long')
    this.statements += 1
  }

  value(expression: Parameters<typeof evaluate>[0]): string {
    const result = evaluate(expression, this.context)
    if (!result.ok) throw new Stop(result.error, result.error.message)
    return result.value
  }

  number(expression: Parameters<typeof evaluate>[0], at: Position): number {
    const n = toNumber(this.value(expression))
    if (!n.ok) throw new Stop(at, n.message)
    return n.value
  }

  boolean(expression: Parameters<typeof evaluate>[0], at: Position): boolean {
    const b = toBoolean(this.value(expression))
    if (!b.ok) throw new Stop(at, b.message)
    return b.value
  }

  requireObject(kind: 'field' | 'button', name: string, at: Position): void {
    if (!this.host.hasObject(kind, name)) throw new Stop(at, `${kind} "${name}" does not exist`)
  }

  block(statements: readonly Statement[]): void {
    for (const statement of statements) this.statement(statement)
  }

  statement(statement: Statement): void {
    this.charge(statement)
    switch (statement.kind) {
      case 'put': {
        const checked = checkLength(this.value(statement.value))
        if (!checked.ok) throw new Stop(statement, checked.message)
        const text = checked.value
        if (statement.into === null) {
          this.host.message(text)
        } else if (statement.into.kind === 'variable') {
          this.context.variables.set(statement.into.name.toLowerCase(), text)
        } else {
          if (!this.host.setFieldText(statement.into.name, text)) {
            throw new Stop(statement.into, `field "${statement.into.name}" does not exist`)
          }
        }
        return
      }
      case 'set': {
        const { objectKind, name } = statement.object
        this.requireObject(objectKind, name, statement.object)
        switch (statement.property) {
          case 'visible':
            this.host.setVisible(objectKind, name, this.boolean(statement.value, statement))
            return
          case 'enabled':
            if (objectKind === 'field') throw new Stop(statement.object, `field "${name}" has no enabled property`)
            this.host.setEnabled(name, this.boolean(statement.value, statement))
            return
          case 'name':
            this.host.setName(objectKind, name, this.value(statement.value))
            return
        }
        return
      }
      case 'get':
        this.context.variables.set('it', this.value(statement.value))
        return
      case 'answer':
        this.host.answer(this.value(statement.value))
        return
      case 'go': {
        const n = Math.trunc(this.number(statement.card, statement))
        if (!this.host.goToCard(n)) throw new Stop(statement, `card ${String(n)} does not exist`)
        return
      }
      case 'show':
      case 'hide': {
        const { objectKind, name } = statement.object
        this.requireObject(objectKind, name, statement.object)
        this.host.setVisible(objectKind, name, statement.kind === 'show')
        return
      }
      case 'if':
        this.ifStatement(statement)
        return
      case 'repeat':
        this.repeatStatement(statement)
        return
    }
  }

  ifStatement(statement: IfStatement): void {
    if (this.boolean(statement.condition, statement)) this.block(statement.then)
    else if (statement.else !== null) this.block(statement.else)
  }

  repeatStatement(statement: RepeatStatement): void {
    const head = statement.head
    // Each iteration after the first charges the repeat statement again, so
    // an empty `repeat forever` still runs into the budget.
    const iteration = (first: boolean): void => {
      if (!first) this.charge(statement)
      this.block(statement.body)
    }
    switch (head.kind) {
      case 'forever':
        for (let first = true; ; first = false) iteration(first)
      case 'times': {
        const count = Math.trunc(this.number(head.count, statement))
        for (let i = 0; i < count; i += 1) iteration(i === 0)
        return
      }
      case 'while':
        for (let first = true; this.boolean(head.condition, statement); first = false) iteration(first)
        return
      case 'with': {
        const from = this.number(head.from, statement)
        const to = this.number(head.to, statement)
        const step = head.direction === 'up' ? 1 : -1
        const variable = head.variable.toLowerCase()
        let first = true
        for (let counter = from; head.direction === 'up' ? counter <= to : counter >= to; counter += step) {
          const rendered = renderNumber(counter)
          if (!rendered.ok) throw new Stop(statement, rendered.message)
          this.context.variables.set(variable, rendered.value)
          iteration(first)
          first = false
        }
        return
      }
    }
  }
}

export function run(program: Program, handler: HandlerName, host: Host, options: RunOptions): RunResult {
  const found = program.handlers.find((h) => h.name === handler)
  if (found === undefined) return { ok: true, statements: 0 }
  const execution = new Execution(host, options.target)
  try {
    execution.block(found.body)
    return { ok: true, statements: execution.statements }
  } catch (error) {
    if (error instanceof Stop) {
      return {
        ok: false,
        statements: execution.statements,
        error: { message: error.message, line: error.position.line, column: error.position.column, handler },
      }
    }
    throw error
  }
}
