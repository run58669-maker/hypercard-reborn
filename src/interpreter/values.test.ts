import { describe, expect, it } from 'vitest'
import {
  MAX_VALUE_LENGTH,
  arithmetic,
  checkLength,
  compare,
  fromBoolean,
  isNumeric,
  renderNumber,
  toBoolean,
  toNumber,
} from './values'

describe('isNumeric', () => {
  it.each([
    ['0', true],
    ['42', true],
    ['-7', true],
    ['3.14', true],
    ['007', true],
    ['  12  ', true],
    ['\t5\t', true],
    ['1.', false],
    ['.5', false],
    ['1e3', false],
    ['+1', false],
    ['', false],
    [' ', false],
    ['abc', false],
    ['1 2', false],
    ['\n5', false],
    ['- 5', false],
  ])('%j is numeric: %s', (value, expected) => {
    expect(isNumeric(value)).toBe(expected)
  })
})

describe('toNumber', () => {
  it.each([
    ['42', 42],
    [' -3.5 ', -3.5],
    ['007', 7],
  ])('converts %j to %d', (value, expected) => {
    expect(toNumber(value)).toEqual({ ok: true, value: expected })
  })

  it('reports a non-number with the offending value', () => {
    expect(toNumber('abc')).toEqual({ ok: false, message: 'expected a number, found "abc"' })
  })

  it('truncates the offending value to 40 characters', () => {
    const long = 'x'.repeat(50)
    expect(toNumber(long)).toEqual({ ok: false, message: `expected a number, found "${'x'.repeat(40)}"` })
  })
})

describe('renderNumber', () => {
  it.each([
    [2.5, '2.5'],
    [2, '2'],
    [-3, '-3'],
    [0, '0'],
    [-0, '0'],
    [1 / 3, '0.333333'],
    [2 / 3, '0.666667'],
    [0.1 + 0.2, '0.3'],
    [1e20, '100000000000000000000'],
    [123456.5, '123456.5'],
    [-1.5, '-1.5'],
    [1e-9, '0'],
  ])('renders %d as %j', (n, expected) => {
    expect(renderNumber(n)).toEqual({ ok: true, value: expected })
  })

  it.each([Infinity, -Infinity, NaN])('rejects %s as out of range', (n) => {
    expect(renderNumber(n)).toEqual({ ok: false, message: 'number out of range' })
  })
})

describe('arithmetic', () => {
  it.each([
    ['+', '1', '2', '3'],
    ['-', '1', '2', '-1'],
    ['*', '3', '4', '12'],
    ['/', '10', '4', '2.5'],
    ['/', '4', '2', '2'],
    ['div', '-7', '2', '-3'],
    ['div', '7', '2', '3'],
    ['div', '7', '-2', '-3'],
    ['mod', '-7', '2', '-1'],
    ['mod', '7', '-2', '1'],
    ['mod', '7', '2', '1'],
    ['+', '0.1', '0.2', '0.3'],
    ['*', ' 2 ', '\t3', '6'],
  ] as const)('%s %s %s = %s', (op, a, b, expected) => {
    expect(arithmetic(op, a, b)).toEqual({ ok: true, value: expected })
  })

  it.each(['/', 'div', 'mod'] as const)('%s by zero is a runtime error', (op) => {
    expect(arithmetic(op, '1', '0')).toEqual({ ok: false, message: 'division by zero' })
  })

  it('reports the first non-numeric operand', () => {
    expect(arithmetic('+', 'abc', 'def')).toEqual({ ok: false, message: 'expected a number, found "abc"' })
    expect(arithmetic('+', '1', 'def')).toEqual({ ok: false, message: 'expected a number, found "def"' })
  })

  it('reports a non-finite result', () => {
    expect(arithmetic('*', '9'.repeat(200), '9'.repeat(200))).toEqual({ ok: false, message: 'number out of range' })
  })
})

describe('compare', () => {
  it.each([
    ['1', '2', -1],
    ['10', '9', 1],
    ['4', '4.0', 0],
    [' 4 ', '4', 0],
    ['abc', 'ABC', 0],
    ['abc', 'abd', -1],
    ['b', 'A', 1],
    ['10', 'abc', -1],
    ['', '', 0],
    ['', 'a', -1],
  ])('compare(%j, %j) = %d', (a, b, expected) => {
    expect(compare(a, b)).toBe(expected)
  })
})

describe('toBoolean', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['False', false],
  ])('accepts %j', (value, expected) => {
    expect(toBoolean(value)).toEqual({ ok: true, value: expected })
  })

  it.each(['', 'yes', '1', ' true'])('rejects %j', (value) => {
    expect(toBoolean(value)).toEqual({ ok: false, message: `expected true or false, found "${value}"` })
  })

  it('renders booleans lower-case', () => {
    expect(fromBoolean(true)).toBe('true')
    expect(fromBoolean(false)).toBe('false')
  })
})

describe('checkLength', () => {
  it('accepts a value of exactly 64 KiB', () => {
    const value = 'a'.repeat(MAX_VALUE_LENGTH)
    expect(checkLength(value)).toEqual({ ok: true, value })
  })

  it('rejects one code unit more', () => {
    expect(checkLength('a'.repeat(MAX_VALUE_LENGTH + 1))).toEqual({ ok: false, message: 'value too long' })
  })
})
