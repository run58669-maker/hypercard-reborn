import { describe, expect, it } from 'vitest'
import { descriptionHash, normalise } from './normalise'

describe('normalise', () => {
  it.each([
    ['  The  Card. ', 'the card'],
    ['the card', 'the card'],
    ['a..', 'a.'],
    ['a.', 'a'],
    ['', ''],
    ['.', ''],
    ['Line\none\r\n\ttwo', 'line one two'],
    ['Hello,   World!', 'hello, world!'],
    ['  .  ', ''],
  ])('normalise(%j) = %j', (input, expected) => {
    expect(normalise(input)).toBe(expected)
  })

  it('makes a spacing, case and trailing-dot variant equal to the plain form', () => {
    expect(normalise('  The  Card. ')).toBe(normalise('the card'))
  })
})

describe('descriptionHash', () => {
  it('is the hex SHA-256 of the normalised utf-8 text', async () => {
    // SHA-256("the card")
    expect(await descriptionHash('  The  Card. ')).toBe(await descriptionHash('the card'))
    expect(await descriptionHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await descriptionHash('abc.')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('differs for different normalised text', async () => {
    expect(await descriptionHash('a')).not.toBe(await descriptionHash('b'))
  })
})
