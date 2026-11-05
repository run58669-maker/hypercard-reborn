// Pretty-printer: Program -> canonical source (design.md §4.1). Two-space
// indent, `\n` newlines, lower-case keywords, handler names as written in
// docs/grammar.md, parentheses only where precedence requires them. Used by
// the round-trip property test; the app never prints a script at runtime.
import type { Expression, Handler, ObjectRef, Program, RepeatHead, Statement } from './ast'

export function print(program: Program): string {
  return program.handlers.map(printHandler).join('\n')
}

function printHandler(handler: Handler): string {
  return `on ${handler.name}\n${printStatements(handler.body, 1)}end ${handler.name}\n`
}

function printStatements(statements: readonly Statement[], depth: number): string {
  return statements.map((s) => printStatement(s, depth)).join('')
}

function printStatement(statement: Statement, depth: number): string {
  const pad = '  '.repeat(depth)
  switch (statement.kind) {
    case 'put': {
      const into = statement.into === null ? '' : ` into ${printContainer(statement.into)}`
      return `${pad}put ${printExpression(statement.value)}${into}\n`
    }
    case 'set':
      return `${pad}set ${statement.property} of ${printObjectRef(statement.object)} to ${printExpression(statement.value)}\n`
    case 'get':
      return `${pad}get ${printExpression(statement.value)}\n`
    case 'answer':
      return `${pad}answer ${printExpression(statement.value)}\n`
    case 'go':
      return `${pad}go to card ${printExpression(statement.card)}\n`
    case 'show':
      return `${pad}show ${printObjectRef(statement.object)}\n`
    case 'hide':
      return `${pad}hide ${printObjectRef(statement.object)}\n`
    case 'if': {
      const condition = printExpression(statement.condition)
      if (statement.form === 'single') {
        const thenPart = printStatement(statement.then[0] as Statement, 0).trimEnd()
        let text = `${pad}if ${condition} then ${thenPart}\n`
        if (statement.else !== null) {
          text += `${pad}else ${printStatement(statement.else[0] as Statement, 0).trimEnd()}\n`
        }
        return text
      }
      let text = `${pad}if ${condition} then\n${printStatements(statement.then, depth + 1)}`
      if (statement.else !== null) text += `${pad}else\n${printStatements(statement.else, depth + 1)}`
      return `${text}${pad}end if\n`
    }
    case 'repeat':
      return `${pad}repeat ${printRepeatHead(statement.head)}\n${printStatements(statement.body, depth + 1)}${pad}end repeat\n`
  }
}

function printRepeatHead(head: RepeatHead): string {
  switch (head.kind) {
    case 'forever':
      return 'forever'
    case 'times':
      return `${printExpression(head.count)} times`
    case 'while':
      return `while ${printExpression(head.condition)}`
    case 'with':
      return `with ${head.variable} = ${printExpression(head.from)} ${head.direction === 'down' ? 'down to' : 'to'} ${printExpression(head.to)}`
  }
}

function printContainer(container: ObjectRef | { kind: 'variable'; name: string }): string {
  return container.kind === 'variable' ? container.name : printObjectRef(container)
}

function printObjectRef(ref: ObjectRef): string {
  return `${ref.objectKind} "${ref.name}"`
}

// Precedence levels from docs/grammar.md §4, lowest first.
const OR = 1
const AND = 2
const NOT = 3
const COMPARISON = 4
const CONCAT = 5
const ADDITIVE = 6
const TERM = 7
const UNARY = 8
const PRIMARY = 9

function level(expression: Expression): number {
  switch (expression.kind) {
    case 'binary':
      switch (expression.operator) {
        case 'or':
          return OR
        case 'and':
          return AND
        case '=':
        case '<>':
        case '<':
        case '>':
        case '<=':
        case '>=':
        case 'is':
        case 'is not':
          return COMPARISON
        case '&':
        case '&&':
          return CONCAT
        case '+':
        case '-':
          return ADDITIVE
        case '*':
        case '/':
        case 'div':
        case 'mod':
          return TERM
      }
      break
    case 'unary':
      return expression.operator === 'not' ? NOT : UNARY
    default:
      return PRIMARY
  }
}

/** Prints `child` in parentheses unless its level is at least `minimum`. */
function operand(child: Expression, minimum: number): string {
  const text = printExpression(child)
  return level(child) >= minimum ? text : `(${text})`
}

export function printExpression(expression: Expression): string {
  switch (expression.kind) {
    case 'number':
      return expression.text
    case 'string':
      return `"${expression.value}"`
    case 'constant':
      return expression.name
    case 'variable':
      return expression.name
    case 'objectRef':
      return printObjectRef(expression)
    case 'builtin':
      return `the ${expression.name}`
    case 'unary': {
      if (expression.operator === 'not') return `not ${operand(expression.operand, NOT)}`
      const inner = operand(expression.operand, UNARY)
      // `--` would start a comment, so keep a space between two minus signs.
      return inner.startsWith('-') ? `- ${inner}` : `-${inner}`
    }
    case 'binary': {
      const own = level(expression)
      // Binary operators are left-associative, so the left operand may sit at
      // the same level; the right one must bind tighter. A comparison takes at
      // most one operator, so both of its operands must bind tighter.
      const left = operand(expression.left, own === COMPARISON ? own + 1 : own)
      const right = operand(expression.right, own + 1)
      return `${left} ${expression.operator} ${right}`
    }
  }
}
