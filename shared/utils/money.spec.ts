import { describe, expect, it } from 'vitest'
import { CURRENCIES, defaultCurrencyForLocale, formatMoney, selectPrice } from './money'

type Prices = { price_usd: number | null, price_pln: number | null, price_eur: number | null }
function priced(overrides: Partial<Prices> = {}) {
  return { price_usd: 10, price_pln: 40, price_eur: 9, ...overrides }
}

describe('selectPrice', () => {
  it('returns the requested currency when its column is set', () => {
    expect(selectPrice(priced(), 'PLN')).toEqual({ amount: 40, currency: 'PLN' })
    expect(selectPrice(priced(), 'EUR')).toEqual({ amount: 9, currency: 'EUR' })
  })

  it('falls back through USD→PLN→EUR when the requested column is null', () => {
    // No USD price → fall back to USD-first order, which skips to PLN.
    const r = selectPrice(priced({ price_usd: null }), 'USD')
    expect(r).toEqual({ amount: 40, currency: 'PLN' })
  })

  it('keeps the fallback currency code (not the requested one)', () => {
    // Asked for EUR but only PLN exists → report PLN so we never label a PLN
    // amount with a € sign.
    const r = selectPrice({ price_usd: null, price_pln: 25, price_eur: null }, 'EUR')
    expect(r).toEqual({ amount: 25, currency: 'PLN' })
  })

  it('returns null when no price is set at all', () => {
    expect(selectPrice({ price_usd: null, price_pln: null, price_eur: null }, 'USD')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formats with the currency symbol/code for the given locale', () => {
    expect(formatMoney(10, 'USD', 'en')).toContain('$')
    expect(formatMoney(10, 'USD', 'en')).toContain('10')

    const pln = formatMoney(79.99, 'PLN', 'pl')
    expect(pln).toContain('79')
    expect(pln).toContain('zł')

    expect(formatMoney(9, 'EUR', 'en')).toContain('€')
  })

  it('defaults to the en locale', () => {
    expect(formatMoney(5, 'USD')).toBe(formatMoney(5, 'USD', 'en'))
  })
})

describe('CURRENCIES', () => {
  it('lists the three supported currencies', () => {
    expect(CURRENCIES.map(c => c.code)).toEqual(['USD', 'PLN', 'EUR'])
  })
})

describe('defaultCurrencyForLocale', () => {
  it('maps pl → PLN and everything else → USD', () => {
    expect(defaultCurrencyForLocale('pl')).toBe('PLN')
    expect(defaultCurrencyForLocale('en')).toBe('USD')
    expect(defaultCurrencyForLocale('de')).toBe('USD')
  })
})
