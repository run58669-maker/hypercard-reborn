// AST for the HyperTalk subset in docs/grammar.md. Every node is a plain object
// with a `kind` discriminator (no classes) and the `line`/`column` of its first
// token so runtime errors can point at a line.
//
// Grammar production -> node type
//   script                      Program
//   handler                     Handler
//   put_stmt                    PutStatement        (into: Container | null)
//   set_stmt                    SetStatement
//   get_stmt                    GetStatement
//   if_stmt (block, single)     IfStatement         (form: 'block' | 'single')
//   repeat_stmt                 RepeatStatement
//   repeat_head  ... times      RepeatTimes
//                with ... to    RepeatWith          (direction: 'up')
//                with ... down to RepeatWith        (direction: 'down')
//                while          RepeatWhile
//                forever        RepeatForever
//   answer_stmt                 AnswerStatement
//   go_stmt                     GoStatement
//   show_stmt                   ShowStatement
//   hide_stmt                   HideStatement
//   container                   Container = VariableRef | ObjectRef
//   object_ref                  ObjectRef
//   property                    Property
//   or_expr, and_expr, comparison, concat_expr, additive, term
//                               BinaryExpression    (operator: BinaryOperator)
//   not_expr ("not"), unary ("-")
//                               UnaryExpression     (operator: 'not' | '-')
//   primary: number             NumberLiteral       (text as written; values are strings)
//            string             StringLiteral       (value without the quotes)
//            true|false|empty|quote|return
//                               ConstantExpression
//            identifier         VariableRef
//            object_ref         ObjectRef
//            "the" builtin      BuiltinExpression   (date | time | target)
//            "(" expression ")" no node: parentheses only group
//
// `return` appears in the reserved-word list and in the §4 semantics ("a single
// newline character") and in bundled example 5, so it is a constant primary.

export interface Position {
  readonly line: number
  readonly column: number
}

export interface Program {
  /** The exact source string that was parsed, by reference. Never normalised. */
  readonly source: string
  readonly handlers: readonly Handler[]
}

export type HandlerName = 'mouseUp' | 'openCard'

export interface Handler extends Position {
  readonly kind: 'handler'
  readonly name: HandlerName
  readonly body: readonly Statement[]
}

// --- Statements -------------------------------------------------------------

export type Statement =
  | PutStatement
  | SetStatement
  | GetStatement
  | IfStatement
  | RepeatStatement
  | AnswerStatement
  | GoStatement
  | ShowStatement
  | HideStatement

export type ObjectKind = 'field' | 'button'

export interface ObjectRef extends Position {
  readonly kind: 'objectRef'
  readonly objectKind: ObjectKind
  /** The string literal's value (without quotes), as written. */
  readonly name: string
}

export interface VariableRef extends Position {
  readonly kind: 'variable'
  /** The identifier as spelled at this site (variables are case-insensitive). */
  readonly name: string
}

export type Container = VariableRef | ObjectRef

export type Property = 'visible' | 'enabled' | 'name'

export interface PutStatement extends Position {
  readonly kind: 'put'
  readonly value: Expression
  /** `null` means "put into the message box". */
  readonly into: Container | null
}

export interface SetStatement extends Position {
  readonly kind: 'set'
  readonly property: Property
  readonly object: ObjectRef
  readonly value: Expression
}

export interface GetStatement extends Position {
  readonly kind: 'get'
  readonly value: Expression
}

export interface IfStatement extends Position {
  readonly kind: 'if'
  /** Block form ends with `end if`; the single-line form has exactly one statement per branch. */
  readonly form: 'block' | 'single'
  readonly condition: Expression
  readonly then: readonly Statement[]
  /** `null` when there is no `else`. */
  readonly else: readonly Statement[] | null
}

export interface RepeatStatement extends Position {
  readonly kind: 'repeat'
  readonly head: RepeatHead
  readonly body: readonly Statement[]
}

export type RepeatHead = RepeatTimes | RepeatWith | RepeatWhile | RepeatForever

export interface RepeatTimes {
  readonly kind: 'times'
  readonly count: Expression
}

export interface RepeatWith {
  readonly kind: 'with'
  /** The counter variable as spelled. */
  readonly variable: string
  readonly from: Expression
  /** `up` for `to`, `down` for `down to`. */
  readonly direction: 'up' | 'down'
  readonly to: Expression
}

export interface RepeatWhile {
  readonly kind: 'while'
  readonly condition: Expression
}

export interface RepeatForever {
  readonly kind: 'forever'
}

export interface AnswerStatement extends Position {
  readonly kind: 'answer'
  readonly value: Expression
}

export interface GoStatement extends Position {
  readonly kind: 'go'
  readonly card: Expression
}

export interface ShowStatement extends Position {
  readonly kind: 'show'
  readonly object: ObjectRef
}

export interface HideStatement extends Position {
  readonly kind: 'hide'
  readonly object: ObjectRef
}

// --- Expressions ------------------------------------------------------------

export type Expression =
  | NumberLiteral
  | StringLiteral
  | ConstantExpression
  | VariableRef
  | ObjectRef
  | BuiltinExpression
  | UnaryExpression
  | BinaryExpression

export interface NumberLiteral extends Position {
  readonly kind: 'number'
  /** The digits exactly as written; this is the value (values are strings). */
  readonly text: string
}

export interface StringLiteral extends Position {
  readonly kind: 'string'
  /** The characters between the quotes; there are no escapes. */
  readonly value: string
}

export type ConstantName = 'true' | 'false' | 'empty' | 'quote' | 'return'

export interface ConstantExpression extends Position {
  readonly kind: 'constant'
  readonly name: ConstantName
}

export type BuiltinName = 'date' | 'time' | 'target'

export interface BuiltinExpression extends Position {
  readonly kind: 'builtin'
  readonly name: BuiltinName
}

export type UnaryOperator = 'not' | '-'

export interface UnaryExpression extends Position {
  readonly kind: 'unary'
  readonly operator: UnaryOperator
  readonly operand: Expression
}

export type BinaryOperator =
  | 'or'
  | 'and'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>='
  | 'is'
  | 'is not'
  | '&'
  | '&&'
  | '+'
  | '-'
  | '*'
  | '/'
  | 'div'
  | 'mod'

export interface BinaryExpression extends Position {
  readonly kind: 'binary'
  readonly operator: BinaryOperator
  readonly left: Expression
  readonly right: Expression
}
