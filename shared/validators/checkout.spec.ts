import { describe, expect, it } from 'vitest'
import { tStub } from '../../test/helpers/i18nStub'
import { createShippingSchema } from './checkout'

const schema = createShippingSchema(tStub)

// country is now ISO-2 (uppercase) — the storefront <USelect> emits these,
// and the backend shipping resolver matches on them exactly.
const valid = { address: '1 Main St', city: 'Town', postalCode: '00-001', country: 'PL', notes: '' }

describe('createShippingSchema', () => {
  it('accepts a complete shipping address with an ISO-2 country', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('requires address, city, postal code, and country', () => {
    for (const field of ['address', 'city', 'postalCode', 'country'] as const) {
      expect(schema.safeParse({ ...valid, [field]: '' }).success).toBe(false)
    }
  })

  it('rejects a country that is not ISO-2 (free-text "Poland" no longer accepted)', () => {
    expect(schema.safeParse({ ...valid, country: 'Poland' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, country: 'pl' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, country: 'PLA' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, country: 'P' }).success).toBe(false)
  })

  it('allows omitting notes', () => {
    const withoutNotes = {
      address: valid.address,
      city: valid.city,
      postalCode: valid.postalCode,
      country: valid.country,
    }
    expect(schema.safeParse(withoutNotes).success).toBe(true)
  })

  it('rejects fields that exceed the backend length limits', () => {
    expect(schema.safeParse({ ...valid, postalCode: 'x'.repeat(21) }).success).toBe(false)
    expect(schema.safeParse({ ...valid, city: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('createShippingSchema — guest checkout', () => {
  const guestSchema = createShippingSchema(tStub, { guest: true })

  it('requires a valid contact email when guest', () => {
    expect(guestSchema.safeParse(valid).success).toBe(false)
    expect(guestSchema.safeParse({ ...valid, email: '' }).success).toBe(false)
    expect(guestSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
    expect(guestSchema.safeParse({ ...valid, email: 'guest@example.com' }).success).toBe(true)
  })

  it('passes the empty email default through when not guest', () => {
    expect(schema.safeParse({ ...valid, email: '' }).success).toBe(true)
  })
})
