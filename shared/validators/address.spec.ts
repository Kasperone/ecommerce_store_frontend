import { describe, expect, it } from 'vitest'
import { tStub } from '../../test/helpers/i18nStub'
import { createAddressSchema } from './address'

const schema = createAddressSchema(tStub)

const valid = {
  label: 'Home',
  recipient_name: 'Jane Doe',
  street: '1 Main St',
  city: 'Town',
  postal_code: '00-001',
  country: 'PL',
  state: '',
  phone: '+48 600 700 800',
  is_default_shipping: false,
  is_default_billing: false,
}

describe('createAddressSchema', () => {
  it('accepts a complete address with an ISO-2 country', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('requires recipient name, street, city, postal code, and country', () => {
    for (const field of ['recipient_name', 'street', 'city', 'postal_code', 'country'] as const) {
      expect(schema.safeParse({ ...valid, [field]: '' }).success).toBe(false)
    }
  })

  it('allows omitting the optional label, state and phone', () => {
    const minimal = {
      recipient_name: 'Jane Doe',
      street: '1 Main St',
      city: 'Town',
      postal_code: '00-001',
      country: 'PL',
      is_default_shipping: false,
      is_default_billing: false,
    }
    expect(schema.safeParse(minimal).success).toBe(true)
  })

  it('rejects a country that is not ISO-2', () => {
    expect(schema.safeParse({ ...valid, country: 'Poland' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, country: 'pl' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, country: 'PLA' }).success).toBe(false)
  })

  it('rejects fields that exceed the backend length limits', () => {
    expect(schema.safeParse({ ...valid, postal_code: 'x'.repeat(21) }).success).toBe(false)
    expect(schema.safeParse({ ...valid, city: 'x'.repeat(101) }).success).toBe(false)
    expect(schema.safeParse({ ...valid, street: 'x'.repeat(256) }).success).toBe(false)
  })

  it('rejects a malformed phone number', () => {
    expect(schema.safeParse({ ...valid, phone: 'call-me-maybe' }).success).toBe(false)
  })

  it('accepts the default flags being set', () => {
    expect(
      schema.safeParse({ ...valid, is_default_shipping: true, is_default_billing: true }).success,
    ).toBe(true)
  })
})
