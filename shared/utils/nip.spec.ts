import { describe, expect, it } from 'vitest'
import { isValidNip, normalizeNip } from './nip'

describe('isValidNip', () => {
  it('accepts checksum-valid NIPs', () => {
    expect(isValidNip('5260001246')).toBe(true)
    expect(isValidNip('1234563218')).toBe(true)
  })

  it('ignores dashes / spaces / PL prefix', () => {
    expect(isValidNip('526-000-12-46')).toBe(true)
    expect(isValidNip('PL 1234563218')).toBe(true)
  })

  it('rejects a bad checksum', () => {
    expect(isValidNip('5260001247')).toBe(false)
    expect(isValidNip('1234567890')).toBe(false)
  })

  it('rejects the wrong length / non-digits', () => {
    expect(isValidNip('123')).toBe(false)
    expect(isValidNip('12345632180')).toBe(false)
    expect(isValidNip('')).toBe(false)
    expect(isValidNip('ABCDEFGHIJ')).toBe(false)
  })
})

describe('normalizeNip', () => {
  it('strips non-digits', () => {
    expect(normalizeNip('526-000-12-46')).toBe('5260001246')
    expect(normalizeNip('PL 1234563218')).toBe('1234563218')
  })
})
