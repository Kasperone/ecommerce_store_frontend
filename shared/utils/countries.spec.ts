import { describe, expect, it } from 'vitest'
import { countryName, countryOptions, KNOWN_COUNTRY_CODES } from './countries'

describe('countryName', () => {
  it('returns the localized name in English by default', () => {
    expect(countryName('PL', 'en')).toBe('Poland')
    expect(countryName('US', 'en')).toBe('United States')
  })

  it('returns the localized name in Polish for the pl locale', () => {
    expect(countryName('PL', 'pl')).toBe('Polska')
    expect(countryName('DE', 'pl')).toBe('Niemcy')
    expect(countryName('US', 'pl')).toBe('Stany Zjednoczone')
  })

  it('normalizes lower-case input', () => {
    expect(countryName('pl', 'en')).toBe('Poland')
  })

  it('falls back to the upper-cased code for an unknown country (no crash)', () => {
    // An admin assigns a zone to ZZ; the page still renders something.
    expect(countryName('ZZ', 'en')).toBe('ZZ')
    expect(countryName('zz', 'pl')).toBe('ZZ')
  })

  it('returns an empty string for null/undefined/empty input', () => {
    expect(countryName('', 'en')).toBe('')
    expect(countryName(null, 'en')).toBe('')
    expect(countryName(undefined, 'pl')).toBe('')
  })
})

describe('countryOptions', () => {
  it('puts PL first', () => {
    const options = countryOptions('en')
    expect(options[0]).toEqual({ value: 'PL', label: 'Poland' })
  })

  it('puts PL first even in the Polish locale', () => {
    const options = countryOptions('pl')
    expect(options[0]).toEqual({ value: 'PL', label: 'Polska' })
  })

  it('sorts non-PL options alphabetically by localized label', () => {
    const en = countryOptions('en')
    const enRest = en.slice(1).map(o => o.label)
    expect(enRest).toEqual([...enRest].sort((a, b) => a.localeCompare(b, 'en')))

    const pl = countryOptions('pl')
    const plRest = pl.slice(1).map(o => o.label)
    expect(plRest).toEqual([...plRest].sort((a, b) => a.localeCompare(b, 'pl')))
  })

  it('emits one entry per known country', () => {
    expect(countryOptions('en')).toHaveLength(KNOWN_COUNTRY_CODES.length)
  })

  it('every option value is an upper-case ISO-2 code', () => {
    for (const opt of countryOptions('en')) {
      expect(opt.value).toMatch(/^[A-Z]{2}$/)
    }
  })
})

describe('KNOWN_COUNTRY_CODES', () => {
  it('contains the seeded BE Test Zone members', () => {
    // Cross-check with the backend conftest's session seed (PL/DE/FR/US/GB)
    // so a future PR can't drop a country the test infra relies on.
    for (const code of ['PL', 'DE', 'FR', 'US', 'GB']) {
      expect(KNOWN_COUNTRY_CODES).toContain(code)
    }
  })
})
