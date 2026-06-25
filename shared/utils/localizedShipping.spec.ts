import { describe, expect, it } from 'vitest'
import {
  localizedShippingMethodDescription,
  localizedShippingMethodName,
} from './localizedShipping'

describe('localizedShippingMethodName', () => {
  it('returns the Polish name for the pl locale when present', () => {
    expect(
      localizedShippingMethodName({ name: 'Standard', name_pl: 'Kurier standardowy' }, 'pl'),
    ).toBe('Kurier standardowy')
  })

  it('returns the English name for the en locale', () => {
    expect(
      localizedShippingMethodName({ name: 'Standard', name_pl: 'Kurier standardowy' }, 'en'),
    ).toBe('Standard')
  })

  it('falls back to the English name when the Polish name is empty/null', () => {
    expect(localizedShippingMethodName({ name: 'Standard', name_pl: null }, 'pl')).toBe('Standard')
    expect(localizedShippingMethodName({ name: 'Standard', name_pl: '' }, 'pl')).toBe('Standard')
    expect(localizedShippingMethodName({ name: 'Standard' }, 'pl')).toBe('Standard')
  })
})

describe('localizedShippingMethodDescription', () => {
  it('returns the Polish description for the pl locale when present', () => {
    expect(
      localizedShippingMethodDescription(
        { description: 'Parcel delivery', description_pl: 'Dostawa kurierska' },
        'pl',
      ),
    ).toBe('Dostawa kurierska')
  })

  it('returns the English description for the en locale', () => {
    expect(
      localizedShippingMethodDescription(
        { description: 'Parcel delivery', description_pl: 'Dostawa kurierska' },
        'en',
      ),
    ).toBe('Parcel delivery')
  })

  it('falls back to English (or null) when the Polish description is empty', () => {
    expect(
      localizedShippingMethodDescription({ description: 'Parcel delivery', description_pl: null }, 'pl'),
    ).toBe('Parcel delivery')
    expect(localizedShippingMethodDescription({ description: null, description_pl: null }, 'pl')).toBeNull()
    expect(localizedShippingMethodDescription({}, 'en')).toBeNull()
  })
})
