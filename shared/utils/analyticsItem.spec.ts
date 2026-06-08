import { describe, expect, it } from 'vitest'
import { analyticsItemId, feedMarketFor } from './analyticsItem'

describe('analyticsItemId — the single item/feed/Ads id scheme', () => {
  it('uses the SKU when present', () => {
    expect(analyticsItemId('SKU-123', 42)).toBe('SKU-123')
  })

  it('falls back to prod_{id} when SKU is null', () => {
    expect(analyticsItemId(null, 42)).toBe('prod_42')
  })

  it('falls back to prod_{id} when SKU is undefined', () => {
    expect(analyticsItemId(undefined, 7)).toBe('prod_7')
  })

  it('treats a blank/whitespace SKU as absent', () => {
    expect(analyticsItemId('   ', 9)).toBe('prod_9')
    expect(analyticsItemId('', 9)).toBe('prod_9')
  })

  it('trims a padded SKU', () => {
    expect(analyticsItemId(' SKU-1 ', 1)).toBe('SKU-1')
  })
})

describe('feedMarketFor — currency/locale → Ads feed market', () => {
  it('PLN → PL/pl', () => {
    expect(feedMarketFor('PLN', 'pl')).toEqual({ country: 'PL', language: 'pl' })
    // currency dominates over locale for PLN
    expect(feedMarketFor('PLN', 'en')).toEqual({ country: 'PL', language: 'pl' })
  })

  it('EUR → DE/en', () => {
    expect(feedMarketFor('EUR', 'en')).toEqual({ country: 'DE', language: 'en' })
    expect(feedMarketFor('EUR', 'pl')).toEqual({ country: 'DE', language: 'en' })
  })

  it('USD → US, language follows locale', () => {
    expect(feedMarketFor('USD', 'en')).toEqual({ country: 'US', language: 'en' })
    expect(feedMarketFor('USD', 'pl')).toEqual({ country: 'US', language: 'pl' })
  })
})
