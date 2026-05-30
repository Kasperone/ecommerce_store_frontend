import { describe, expect, it } from 'vitest'
import { applyShippingRate } from './shippingRate'

/**
 * Mirrors `tests/unit/test_crud_shipping.py::TestApplyShippingRate` on the
 * backend so the FE preview line + the BE order-create resolver can never
 * disagree on the same inputs.
 */

describe('applyShippingRate — flat', () => {
  it('returns the base amount for any subtotal', () => {
    const rate = { amount: 19.99 }
    expect(applyShippingRate(rate, 0)).toBe(19.99)
    expect(applyShippingRate(rate, 999)).toBe(19.99)
  })
})

describe('applyShippingRate — free_above', () => {
  it('triggers at the threshold (>=)', () => {
    const rate = { amount: 19.99, free_above_subtotal: 200 }
    expect(applyShippingRate(rate, 199.99)).toBe(19.99)
    expect(applyShippingRate(rate, 200)).toBe(0)
    expect(applyShippingRate(rate, 500)).toBe(0)
  })
})

describe('applyShippingRate — tiers', () => {
  it('picks the band with the largest min_subtotal <= subtotal', () => {
    const rate = {
      amount: 29.99,
      tiers: [
        { min_subtotal: 0, amount: 29.99 },
        { min_subtotal: 300, amount: 19.99 },
        { min_subtotal: 600, amount: 9.99 },
      ],
    }
    expect(applyShippingRate(rate, 0)).toBe(29.99)
    expect(applyShippingRate(rate, 299.99)).toBe(29.99)
    expect(applyShippingRate(rate, 300)).toBe(19.99)
    expect(applyShippingRate(rate, 599.99)).toBe(19.99)
    expect(applyShippingRate(rate, 600)).toBe(9.99)
    expect(applyShippingRate(rate, 9999)).toBe(9.99)
  })

  it('falls back to amount when no band matches', () => {
    const rate = { amount: 19.99, tiers: [{ min_subtotal: 100, amount: 14.99 }] }
    expect(applyShippingRate(rate, 50)).toBe(19.99) // no band <= 50 → flat
    expect(applyShippingRate(rate, 100)).toBe(14.99) // band boundary
  })

  it('treats empty tiers like unset', () => {
    expect(applyShippingRate({ amount: 19.99, tiers: [] }, 50)).toBe(19.99)
  })

  it('treats null tiers like unset', () => {
    expect(applyShippingRate({ amount: 19.99, tiers: null }, 50)).toBe(19.99)
  })
})

describe('applyShippingRate — free_above wins over tiers', () => {
  it('triggers free-above at threshold even when tiers would apply', () => {
    const rate = {
      amount: 29.99,
      free_above_subtotal: 500,
      tiers: [
        { min_subtotal: 0, amount: 29.99 },
        { min_subtotal: 300, amount: 19.99 },
      ],
    }
    // Below threshold: tier 0 / tier 300 apply.
    expect(applyShippingRate(rate, 299)).toBe(29.99)
    expect(applyShippingRate(rate, 499)).toBe(19.99)
    // At threshold: free-above wins.
    expect(applyShippingRate(rate, 500)).toBe(0)
  })
})

describe('applyShippingRate — boundary defenses', () => {
  it('handles free_above_subtotal=null/undefined identically to unset', () => {
    expect(applyShippingRate({ amount: 5, free_above_subtotal: null }, 10)).toBe(5)
    expect(applyShippingRate({ amount: 5, free_above_subtotal: undefined }, 10)).toBe(5)
  })
})
