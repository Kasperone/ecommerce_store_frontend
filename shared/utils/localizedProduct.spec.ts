import { describe, expect, it } from 'vitest'
import { localizedProductDescription, localizedProductName } from './localizedProduct'

describe('localizedProductName', () => {
  it('returns the Polish name for the pl locale when present', () => {
    expect(localizedProductName({ name: 'Phone', name_pl: 'Telefon' }, 'pl')).toBe('Telefon')
  })

  it('returns the English name for the en locale', () => {
    expect(localizedProductName({ name: 'Phone', name_pl: 'Telefon' }, 'en')).toBe('Phone')
  })

  it('falls back to the English name when the Polish name is empty/null', () => {
    expect(localizedProductName({ name: 'Phone', name_pl: null }, 'pl')).toBe('Phone')
    expect(localizedProductName({ name: 'Phone', name_pl: '' }, 'pl')).toBe('Phone')
    expect(localizedProductName({ name: 'Phone' }, 'pl')).toBe('Phone')
  })
})

describe('localizedProductDescription', () => {
  it('returns the Polish description for the pl locale when present', () => {
    expect(
      localizedProductDescription({ description: 'A phone', description_pl: 'Telefon' }, 'pl'),
    ).toBe('Telefon')
  })

  it('returns the English description for the en locale', () => {
    expect(
      localizedProductDescription({ description: 'A phone', description_pl: 'Telefon' }, 'en'),
    ).toBe('A phone')
  })

  it('falls back to English (or null) when the Polish description is empty', () => {
    expect(localizedProductDescription({ description: 'A phone', description_pl: null }, 'pl')).toBe(
      'A phone',
    )
    expect(localizedProductDescription({ description: null, description_pl: null }, 'pl')).toBeNull()
    expect(localizedProductDescription({}, 'en')).toBeNull()
  })
})
