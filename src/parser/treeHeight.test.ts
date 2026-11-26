import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Expression, Program, RepeatHead, Statement } from './ast'
import { MAX_NESTING, parse } from './index'

// Task 18.2, requirements 7.4 and 7.5. nesting.test.ts checks the limit on
// hand-picked scripts. This file checks it against the tree. It builds
// expressions whose height it knows from how it built them, never from the
// parser's counters, and asserts two things: parse accepts exactly the scripts
// that spend 64 levels or fewer, and the tree it returns is no higher than
// that. The walk below uses an explicit stack, so a broken bound shows up as a
// number and not as a RangeError.

const MESSAGE = 'expression too long or nested too deeply (limit 64)'

// --- Shapes: source text with a known height ---------------------------------

/** Precedence of the outermost form, loosest first (docs/grammar.md §3). */
const OR = 0
const AND = 1
const NOT = 2
const COMPARISON = 3
const CONCAT = 4
const ADDITIVE = 5
const TERM = 6
const UNARY = 7
const PRIMARY = 8

interface Shape {
  readonly text: string
  /** Levels spent: one per `(`, `not` and unary `-`, and one per operator above its higher operand. */
  readonly height: number
  readonly level: number
}

const OPERATORS: ReadonlyArray<readonly [operator: string, level: number]> = [
  ['or', OR],
  ['and', AND],
  ['=', COMPARISON],
  ['<>', COMPARISON],
  ['<', COMPARISON],
  ['>', COMPARISON],
  ['<=', COMPARISON],
  ['>=', COMPARISON],
  ['is', COMPARISON],
  ['is not', COMPARISON],
  ['&', CONCAT],
  ['&&', CONCAT],
  ['+', ADDITIVE],
  ['-', ADDITIVE],
  ['*', TERM],
  ['/', TERM],
  ['div', TERM],
  ['mod', TERM],
]

const LEAVES = ['1', 'x', '"a"', 'true', 'empty', 'field "f"', 'the time'] as const

function leaf(index: number): Shape {
  return { text: LEAVES[index % LEAVES.length] ?? '1', height: 0, level: PRIMARY }
}

function paren(shape: Shape): Shape {
  return { text: `(${shape.text})`, height: shape.height + 1, level: PRIMARY }
}

/** `shape` as it has to be written where the grammar wants `level` or tighter. */
function atLeast(shape: Shape, level: number): Shape {
  return shape.level >= level ? shape : paren(shape)
}

function not(shape: Shape): Shape {
  const operand = atLeast(shape, NOT)
  return { text: `not ${operand.text}`, height: operand.height + 1, level: NOT }
}

function minus(shape: Shape): Shape {
  const operand = atLeast(shape, UNARY)
  return { text: `- ${operand.text}`, height: operand.height + 1, level: UNARY }
}

function binary(index: number, left: Shape, right: Shape): Shape {
  const [operator, level] = OPERATORS[index % OPERATORS.length] ?? ['+', ADDITIVE]
  // Chains are left-associative; a comparison takes one operator, so its left
  // operand has to be tighter as well.
  const l = atLeast(left, level === COMPARISON ? CONCAT : level)
  const r = atLeast(right, level + 1)
  return { text: `${l.text} ${operator} ${r.text}`, height: 1 + Math.max(l.height, r.height), level }
}

// --- Recipes: a leaf and the steps that wrap it --------------------------------

type Wrap = { readonly kind: 'paren' } | { readonly kind: 'not' } | { readonly kind: 'minus' }

interface Join {
  /** `left`: what has been built so far becomes the left operand; `right`: the right one. */
  readonly kind: 'left' | 'right'
  readonly operator: number
  readonly other: Recipe
}

type Step = Wrap | Join

interface Recipe {
  readonly leaf: number
  readonly steps: readonly Step[]
}

function apply(shape: Shape, step: Step): Shape {
  switch (step.kind) {
    case 'paren':
      return paren(shape)
    case 'not':
      return not(shape)
    case 'minus':
      return minus(shape)
    case 'left':
      return binary(step.operator, shape, build(step.other))
    case 'right':
      return binary(step.operator, build(step.other), shape)
  }
}

function build(recipe: Recipe): Shape {
  return recipe.steps.reduce(apply, leaf(recipe.leaf))
}

const arbWrap: fc.Arbitrary<Wrap> = fc.constantFrom<Wrap>({ kind: 'paren' }, { kind: 'paren' }, { kind: 'not' }, { kind: 'minus' })

function arbJoin(other: fc.Arbitrary<Recipe>): fc.Arbitrary<Join> {
  return fc.record({
    // Three in four joins nest what was built so far on the left: the case the first draft got wrong.
    kind: fc.constantFrom<Join['kind']>('left', 'left', 'left', 'right'),
    operator: fc.nat({ max: OPERATORS.length - 1 }),
    other,
  })
}

const arbLeaf = fc.nat({ max: LEAVES.length - 1 })

/** Other operands: mostly a leaf or two wraps, sometimes a tall expression of its own. */
const arbFlat: fc.Arbitrary<Recipe> = fc.record({ leaf: arbLeaf, steps: fc.array(arbWrap, { maxLength: 3 }) })
const arbTall: fc.Arbitrary<Recipe> = fc.record({
  leaf: arbLeaf,
  steps: fc.array(fc.oneof(arbWrap, arbJoin(arbFlat)), { minLength: 10, maxLength: 70, size: 'max' }),
})
const arbOther: fc.Arbitrary<Recipe> = fc.oneof({ weight: 9, arbitrary: arbFlat }, { weight: 1, arbitrary: arbTall })

const arbRecipe: fc.Arbitrary<Recipe> = fc.record({
  leaf: arbLeaf,
  steps: fc.array(fc.oneof({ weight: 2, arbitrary: arbWrap }, { weight: 3, arbitrary: arbJoin(arbOther) }), {
    maxLength: 130,
    size: 'max',
  }),
})

// --- Scripts around an expression ----------------------------------------------

type Block = 'if' | 'repeat'
type Place = 'put' | 'condition' | 'head'

/** A handler with `expression` in `place`, inside `blocks` (outermost first). */
function script(expression: string, blocks: readonly Block[], place: Place): string {
  const lines: string[] = []
  const pad = (depth: number): string => '  '.repeat(depth + 1)
  blocks.forEach((block, depth) => {
    lines.push(`${pad(depth)}${block === 'if' ? 'if true then' : 'repeat 1 times'}`)
  })
  const inner = pad(blocks.length)
  if (place === 'put') lines.push(`${inner}put ${expression} into x`)
  if (place === 'condition') lines.push(`${inner}if ${expression} then`, `${inner}  put 1 into x`, `${inner}end if`)
  if (place === 'head') lines.push(`${inner}repeat ${expression} times`, `${inner}  put 1 into x`, `${inner}end repeat`)
  blocks.forEach((_block, index) => {
    const depth = blocks.length - 1 - index
    lines.push(`${pad(depth)}end ${blocks[depth] ?? 'if'}`)
  })
  return `on mouseUp\n${lines.join('\n')}\nend mouseUp\n`
}

// --- The independent measure -----------------------------------------------------

/** Unary and binary nodes on the longest path down from `root`. Parentheses leave no node. */
function expressionHeight(root: Expression): number {
  let highest = 0
  const stack: Array<[Expression, number]> = [[root, 0]]
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const [node, above] = entry
    if (node.kind === 'unary') stack.push([node.operand, above + 1])
    else if (node.kind === 'binary') stack.push([node.left, above + 1], [node.right, above + 1])
    else highest = Math.max(highest, above)
  }
  return highest
}

function headExpressions(head: RepeatHead): Expression[] {
  switch (head.kind) {
    case 'times':
      return [head.count]
    case 'with':
      return [head.from, head.to]
    case 'while':
      return [head.condition]
    case 'forever':
      return []
  }
}

/** The deepest point of the program: enclosing block `if` and `repeat` bodies plus the expression's nodes. */
function programHeight(program: Program): number {
  let highest = 0
  const measure = (expression: Expression, blocks: number): void => {
    highest = Math.max(highest, blocks + expressionHeight(expression))
  }
  const stack: Array<[Statement, number]> = program.handlers.flatMap((handler) => handler.body.map((s): [Statement, number] => [s, 0]))
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const [statement, blocks] = entry
    highest = Math.max(highest, blocks)
    switch (statement.kind) {
      case 'put':
      case 'set':
      case 'get':
      case 'answer':
        measure(statement.value, blocks)
        break
      case 'go':
        measure(statement.card, blocks)
        break
      case 'if': {
        measure(statement.condition, blocks)
        const inside = statement.form === 'block' ? blocks + 1 : blocks
        for (const s of [...statement.then, ...(statement.else ?? [])]) stack.push([s, inside])
        break
      }
      case 'repeat':
        for (const e of headExpressions(statement.head)) measure(e, blocks)
        for (const s of statement.body) stack.push([s, blocks + 1])
        break
      case 'show':
      case 'hide':
        break
    }
  }
  return highest
}

/** Parses `source`, which spends `levels` levels, and checks the outcome against the limit. */
function check(source: string, levels: number): 'parsed' | 'refused' {
  const result = parse(source)
  if (levels > MAX_NESTING) {
    expect(result.ok ? 'parsed' : result.error.message, `${String(levels)} levels:\n${source}`).toBe(MESSAGE)
    return 'refused'
  }
  if (!result.ok) throw new Error(`${String(levels)} levels refused: ${result.error.message}\n${source}`)
  expect(programHeight(result.program), source).toBeLessThanOrEqual(levels)
  return 'parsed'
}

// --- Tests -----------------------------------------------------------------------

describe('the independent measure', () => {
  const height = (source: string): number => {
    const result = parse(source)
    if (!result.ok) throw new Error(result.error.message)
    return programHeight(result.program)
  }

  it('counts operators and unary nodes on the longest path, and no parentheses', () => {
    expect(height(script('1', [], 'put'))).toBe(0)
    expect(height(script('((1))', [], 'put'))).toBe(0)
    expect(height(script('"a" & "b" & "c"', [], 'put'))).toBe(2)
    expect(height(script('1 + (2 * (3 - 4))', [], 'put'))).toBe(3)
    expect(height(script('not - x', [], 'put'))).toBe(2)
  })

  it('adds the enclosing block bodies, and neither conditions nor repeat heads', () => {
    expect(height(script('1 + 1', ['if', 'repeat'], 'put'))).toBe(3)
    expect(height(script('1 + 1', ['if'], 'condition'))).toBe(2)
    expect(height(script('1 + 1', ['repeat'], 'head'))).toBe(2)
    expect(height('on mouseUp\n  if true then put 1 + 1 into x\nend mouseUp\n')).toBe(1)
  })

  it('knows the height of what it builds', () => {
    const shape = build({ leaf: 0, steps: [{ kind: 'not' }, { kind: 'left', operator: 12, other: { leaf: 1, steps: [] } }, { kind: 'minus' }] })
    // `not 1` is looser than `+`, and the sum is looser than unary `-`: two pairs of parentheses.
    expect(shape).toEqual({ text: '- ((not 1) + x)', height: 5, level: UNARY })
  })
})

describe('the limit follows the tree', () => {
  it('refuses a flat chain of 65 operators with a message that says "too long"', () => {
    const source = script(`"a"${' & "a"'.repeat(65)}`, [], 'put')
    const result = parse(source)
    expect(result.ok ? null : result.error).toEqual({
      line: 2,
      // The expression starts in column 7; `"a"` is 3 wide and each ` & "a"` 6: the 65th `&`.
      column: 7 + 3 + 6 * 64 + 1,
      message: MESSAGE,
      near: source.split('\n')[1],
    })
    expect(parse(script(`"a"${' & "a"'.repeat(64)}`, [], 'put')).ok).toBe(true)
  })

  it('reads the same message for 65 parentheses', () => {
    const result = parse(script(`${'('.repeat(65)}1${')'.repeat(65)}`, [], 'put'))
    expect(result.ok ? null : result.error.message).toBe(MESSAGE)
  })

  // The family that defeated the first draft of design.md §4.4: with one counter
  // released on return, k = 64 passed the check with a tree 4,096 nodes high.
  it.each(Array.from({ length: 64 }, (_unused, index) => index + 1))(
    'counts %i parentheses, each closing one followed by as many operators',
    (k) => {
      let shape = leaf(0)
      for (let i = 0; i < k; i += 1) {
        shape = paren(shape)
        // `+` and `-` alternate: one precedence level, so no parentheses are added.
        for (let j = 0; j < k; j += 1) shape = binary(12 + (j % 2), shape, leaf(0))
      }
      expect(shape.height).toBe(k * (k + 1))
      expect(check(script(shape.text, [], 'put'), shape.height)).toBe(k <= 7 ? 'parsed' : 'refused')
    },
  )

  it('accepts exactly the generated scripts that spend 64 levels or fewer', () => {
    const outcomes = { parsed: 0, refused: 0, atLimit: 0 }
    fc.assert(
      fc.property(
        arbRecipe,
        fc.array(fc.constantFrom<Block>('if', 'repeat'), { maxLength: 5 }),
        fc.constantFrom<Place>('put', 'put', 'condition', 'head'),
        (recipe, blocks, place) => {
          // A condition or a repeat head sits beside a body, which is one level by itself.
          const levels = (shape: Shape): number => blocks.length + Math.max(shape.height, place === 'put' ? 0 : 1)
          // Every step adds at least one level, so the shapes along the recipe
          // cross the limit once: `under` is the last that fits, `over` the next.
          let under = leaf(recipe.leaf)
          let over: Shape | null = null
          for (const step of recipe.steps) {
            const next = apply(under, step)
            if (levels(next) > MAX_NESTING) {
              over = next
              break
            }
            under = next
          }
          outcomes[check(script(under.text, blocks, place), levels(under))] += 1
          if (levels(under) === MAX_NESTING) outcomes.atLimit += 1
          if (over !== null) outcomes[check(script(over.text, blocks, place), levels(over))] += 1
          const whole = build(recipe)
          outcomes[check(script(whole.text, blocks, place), levels(whole))] += 1
        },
      ),
      { numRuns: 2000, seed: 20261126 },
    )
    expect(outcomes.parsed).toBeGreaterThan(2000)
    expect(outcomes.refused).toBeGreaterThan(500)
    expect(outcomes.atLimit).toBeGreaterThan(100)
  })
})
