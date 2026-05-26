import { describe, expect, it } from 'vitest'
import { tStub } from '../../test/helpers/i18nStub'
import { createShippingSchema } from './checkout'

const schema = createShippingSchema(tStub)

const valid = { address: '1 Main St', city: 'Town', postalCode: '00-001', country: 'Poland', notes: '' }

describe('createShippingSchema', () => {
  it('accepts a complete shipping address', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('requires address, city, postal code, and country', () => {
    for (const field of ['address', 'city', 'postalCode', 'country'] as const) {
      expect(schema.safeParse({ ...valid, [field]: '' }).success).toBe(false)
    }
  })

  it('allows omitting notes', () => {
    const withoutNotes = { address: valid.address, city: valid.city, postalCode: valid.postalCode, country: valid.country }
    expect(schema.safeParse(withoutNotes).success).toBe(true)
  })

  it('rejects fields that exceed the backend length limits', () => {
    expect(schema.safeParse({ ...valid, postalCode: 'x'.repeat(21) }).success).toBe(false)
    expect(schema.safeParse({ ...valid, city: 'x'.repeat(101) }).success).toBe(false)
  })
})
