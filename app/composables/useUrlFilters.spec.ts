import { describe, expect, it } from 'vitest'
import { fromQueryValue, toQueryValue } from './useUrlFilters'

describe('toQueryValue', () => {
  it('returns undefined for nullish or empty values', () => {
    expect(toQueryValue(undefined)).toBeUndefined()
    expect(toQueryValue(null)).toBeUndefined()
    expect(toQueryValue('')).toBeUndefined()
  })

  it('serialises booleans as true/false strings', () => {
    expect(toQueryValue(true)).toBe('true')
    expect(toQueryValue(false)).toBe('false')
  })

  it('serialises numbers and strings via String()', () => {
    expect(toQueryValue(42)).toBe('42')
    expect(toQueryValue('search term')).toBe('search term')
  })
})

describe('fromQueryValue', () => {
  it('returns undefined for missing or empty raw inputs', () => {
    expect(fromQueryValue(undefined, '')).toBeUndefined()
    expect(fromQueryValue(null, '')).toBeUndefined()
    expect(fromQueryValue('', '')).toBeUndefined()
  })

  it('parses booleans when the sample is boolean', () => {
    expect(fromQueryValue('true', false)).toBe(true)
    expect(fromQueryValue('false', false)).toBe(false)
    expect(fromQueryValue('yes', false)).toBeUndefined()
  })

  it('parses numbers when the sample is numeric', () => {
    expect(fromQueryValue('42', 0)).toBe(42)
    expect(fromQueryValue('not-a-number', 0)).toBeUndefined()
  })

  it('returns the string as-is for string samples', () => {
    expect(fromQueryValue('foo', '')).toBe('foo')
  })

  it('handles array query values by taking the first entry (vue-router quirk)', () => {
    expect(fromQueryValue(['first', 'second'], '')).toBe('first')
  })
})
