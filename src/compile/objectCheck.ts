// Object check (design.md §6.8, requirement 6). Pure: imports only parser types.
// A card's fields and buttons are fixed by its layout, so a script that parses
// can still name an object the card lacks. These two functions find such names
// before the script is stored.
import type { Expression, ObjectRef, Program, Statement } from '../parser'

export interface ObjectName {
  readonly kind: 'field' | 'button'
  readonly name: string
}

function sameObject(a: ObjectName, b: ObjectName): boolean {
  // Kind must be equal; names are compared with toLowerCase(), as DomHost.find does.
  return a.kind === b.kind && a.name.toLowerCase() === b.name.toLowerCase()
}

/** Every ObjectRef in the program, in source order, duplicates removed (same kind, same name ignoring case). */
export function referencedObjects(program: Program): ObjectName[] {
  const found: ObjectName[] = []

  const add = (ref: ObjectRef): void => {
    const candidate: ObjectName = { kind: ref.objectKind, name: ref.name }
    if (!found.some((seen) => sameObject(seen, candidate))) found.push(candidate)
  }

  const expression = (node: Expression): void => {
    switch (node.kind) {
      case 'objectRef':
        add(node)
        return
      case 'unary':
        expression(node.operand)
        return
      case 'binary':
        expression(node.left)
        expression(node.right)
        return
      case 'number':
      case 'string':
      case 'constant':
      case 'variable':
      case 'builtin':
        return
    }
  }

  const statements = (body: readonly Statement[]): void => {
    for (const node of body) statement(node)
  }

  const statement = (node: Statement): void => {
    switch (node.kind) {
      case 'put':
        expression(node.value)
        if (node.into !== null && node.into.kind === 'objectRef') add(node.into)
        return
      case 'set':
        add(node.object)
        expression(node.value)
        return
      case 'get':
      case 'answer':
        expression(node.value)
        return
      case 'go':
        expression(node.card)
        return
      case 'show':
      case 'hide':
        add(node.object)
        return
      case 'if':
        expression(node.condition)
        statements(node.then)
        if (node.else !== null) statements(node.else)
        return
      case 'repeat':
        switch (node.head.kind) {
          case 'times':
            expression(node.head.count)
            break
          case 'with':
            expression(node.head.from)
            expression(node.head.to)
            break
          case 'while':
            expression(node.head.condition)
            break
          case 'forever':
            break
        }
        statements(node.body)
        return
    }
  }

  for (const handler of program.handlers) statements(handler.body)
  return found
}

/** The referenced objects that `objects` does not contain. */
export function missingObjects(program: Program, objects: readonly ObjectName[]): ObjectName[] {
  return referencedObjects(program).filter((ref) => !objects.some((have) => sameObject(have, ref)))
}
