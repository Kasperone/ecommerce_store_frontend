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

/**
 * Weight-tier mirror of `TestApplyShippingRateWeightTiers` on the backend.
 * Same band table + same precedence assertions so the BE order-create
 * resolver and the FE preview line can never disagree on the same inputs.
 */

const WEIGHT_BANDS = [
  { max_weight_kg: 1, amount: 9.99 },
  { max_weight_kg: 5, amount: 19.99 },
  { max_weight_kg: 30, amount: 49.99 },
]

describe('applyShippingRate — weight tiers (smallest covering band)', () => {
  it.each([
    [0.5, 9.99], // under band 1's max → band 1 covers
    [1.0, 9.99], // at band 1's max → still covers
    [1.01, 19.99], // just over band 1 → band 2
    [5.0, 19.99], // at band 2's max → still covers
    [5.01, 49.99], // just over band 2 → band 3
    [30.0, 49.99], // at band 3's max → still covers
  ])('picks the cheapest band whose max_weight_kg covers %f kg → $%f', (weight, expected) => {
    const rate = { amount: 99.99, weight_tiers: WEIGHT_BANDS }
    expect(applyShippingRate(rate, 0, weight)).toBe(expected)
  })

  it('falls through to subtotal-tiers when weight exceeds every band', () => {
    const rate = {
      amount: 99.99,
      weight_tiers: WEIGHT_BANDS,
      tiers: [{ min_subtotal: 0, amount: 79.99 }],
    }
    expect(applyShippingRate(rate, 50, 31)).toBe(79.99)
  })

  it('falls through to flat amount when weight exceeds every band and no subtotal-tier matches', () => {
    const rate = { amount: 99.99, weight_tiers: WEIGHT_BANDS }
    expect(applyShippingRate(rate, 50, 31)).toBe(99.99)
  })
})

describe('applyShippingRate — D1 precedence (free-above > weight > subtotal > flat)', () => {
  it('free_above wins over weight tiers at threshold', () => {
    const rate = { amount: 99.99, free_above_subtotal: 500, weight_tiers: WEIGHT_BANDS }
    // Below threshold: weight bracket applies.
    expect(applyShippingRate(rate, 499, 2)).toBe(19.99)
    // At threshold: free-above zeroes out regardless of weight.
    expect(applyShippingRate(rate, 500, 2)).toBe(0)
    expect(applyShippingRate(rate, 9999, 20)).toBe(0)
  })

  it('weight tiers win over subtotal tiers', () => {
    const rate = {
      amount: 99.99,
      weight_tiers: WEIGHT_BANDS,
      tiers: [
        { min_subtotal: 0, amount: 14.99 },
        { min_subtotal: 300, amount: 4.99 },
      ],
    }
    // 2 kg cart with a $400 subtotal: weight band 2 wins ($19.99), NOT
    // subtotal band 1 ($4.99).
    expect(applyShippingRate(rate, 400, 2)).toBe(19.99)
  })

  it('weight=0 skips the weight branch (legacy NULL-weight cart)', () => {
    const rate = {
      amount: 99.99,
      weight_tiers: WEIGHT_BANDS,
      tiers: [{ min_subtotal: 0, amount: 14.99 }],
    }
    expect(applyShippingRate(rate, 100, 0)).toBe(14.99)
    // No subtotal tier either → flat fallback.
    const flatRate = { amount: 99.99, weight_tiers: WEIGHT_BANDS }
    expect(applyShippingRate(flatRate, 100, 0)).toBe(99.99)
  })

  it('treats empty/null weight_tiers like unset', () => {
    expect(applyShippingRate({ amount: 19.99, weight_tiers: [] }, 50, 2)).toBe(19.99)
    expect(applyShippingRate({ amount: 19.99, weight_tiers: null }, 50, 2)).toBe(19.99)
  })

  it('default weightKg=0 keeps legacy call sites working', () => {
    const rate = { amount: 19.99, weight_tiers: WEIGHT_BANDS }
    // 2-arg call (no weight) → weight branch skipped → flat amount.
    expect(applyShippingRate(rate, 50)).toBe(19.99)
  })
})
