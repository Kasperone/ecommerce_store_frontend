import { describe, expect, it } from 'vitest'
import { createCompanyProfileSchema } from './companyProfile'
import { tStub } from '../../test/helpers/i18nStub'

/**
 * Company-profile form validator. Mirrors the backend's narrow
 * `CompanyProfileUpdate` allow-list: every field is optional, empty strings are
 * accepted (they clear the field on the wire), and only typed values are
 * format-checked.
 */

const schema = createCompanyProfileSchema(tStub)

describe('createCompanyProfileSchema', () => {
  it('accepts an all-empty object (nothing changed)', () => {
    const result = schema.safeParse({
      tax_id: '',
      regon: '',
      email: '',
      phone: '',
      billing_address_street: '',
      billing_address_city: '',
      billing_address_postal_code: '',
      billing_address_country: '',
      billing_address_state: '',
      default_currency: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a fully-populated valid profile', () => {
    const result = schema.safeParse({
      tax_id: 'PL1234567890',
      regon: '123456789',
      email: 'billing@acme.test',
      phone: '+48 22 123 45 67',
      billing_address_street: 'ul. Testowa 1',
      billing_address_city: 'Warszawa',
      billing_address_postal_code: '00-001',
      billing_address_country: 'Poland',
      billing_address_state: 'Mazowieckie',
      default_currency: 'PLN',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a malformed email when one is typed', () => {
    const result = schema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty email (clears it)', () => {
    const result = schema.safeParse({ email: '' })
    expect(result.success).toBe(true)
  })

  it('rejects a non-3-letter currency code', () => {
    expect(schema.safeParse({ default_currency: 'EURO' }).success).toBe(false)
    expect(schema.safeParse({ default_currency: 'US' }).success).toBe(false)
    expect(schema.safeParse({ default_currency: '12' }).success).toBe(false)
  })

  it('accepts a lower-case 3-letter currency (backend upper-cases it)', () => {
    expect(schema.safeParse({ default_currency: 'usd' }).success).toBe(true)
  })

  it('rejects a tax id over 64 characters', () => {
    expect(schema.safeParse({ tax_id: 'x'.repeat(65) }).success).toBe(false)
  })

  it('accepts an EU VAT id (backend format-checks) and an empty one (clears it)', () => {
    expect(schema.safeParse({ vat_id: 'DE811907980' }).success).toBe(true)
    expect(schema.safeParse({ vat_id: '' }).success).toBe(true)
  })

  it('rejects a vat id over 20 characters', () => {
    expect(schema.safeParse({ vat_id: 'X'.repeat(21) }).success).toBe(false)
  })

  it('rejects a phone with letters', () => {
    expect(schema.safeParse({ phone: 'call-me' }).success).toBe(false)
  })
})
