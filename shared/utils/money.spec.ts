import { describe, expect, it } from 'vitest'
import { CURRENCIES, defaultCurrencyForLocale, formatMoney, formatMoneyCompact, isCurrencyCode, selectPrice } from './money'

// pl-PL uses a non-breaking space (U+00A0) for BOTH the thousands separator and
// the gap before the `zł` symbol — NOT an ASCII space. Asserting with a normal
// space silently fails, so the escape is spelled out here for every assertion.
const NBSP = ' '

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
  it('formats Polish PLN as "1234,50 zł" with a comma decimal + nbsp before zł', () => {
    const pln = formatMoney(1234.5, 'PLN', 'pl')
    expect(pln).toBe(`1234,50${NBSP}zł`)
    expect(pln).toContain(',') // comma decimal separator
    expect(pln).toContain('zł')
  })

  it('uses a non-breaking space before zł, never an ASCII space', () => {
    const pln = formatMoney(1234.5, 'PLN', 'pl')
    // The classic snapshot trap: the same glyphs with an ASCII space must NOT match.
    expect(pln).not.toContain('1234,50 zł')
    expect(pln).toContain(`50${NBSP}zł`)
    // The byte before "zł" is U+00A0, not U+0020.
    expect(pln.charCodeAt(pln.indexOf('zł') - 1)).toBe(0x00A0)
  })

  it('groups thousands with a non-breaking space, but not 4-digit integers (minimumGroupingDigits=2)', () => {
    // 5+ integer digits group; 4 digits do not — correct Polish typography.
    expect(formatMoney(12345.67, 'PLN', 'pl')).toBe(`12${NBSP}345,67${NBSP}zł`)
    expect(formatMoney(1234.5, 'PLN', 'pl')).toBe(`1234,50${NBSP}zł`)
  })

  it('prefers the local symbol over the ISO code for an English visitor (D1 narrowSymbol)', () => {
    // The whole point of D1: en + PLN shows "zł", not "PLN".
    const pln = formatMoney(1234.5, 'PLN', 'en')
    expect(pln).toBe(`zł${NBSP}1,234.50`)
    expect(pln).not.toContain('PLN')
  })

  it('renders the $ symbol (not "USD") even in the Polish locale (D1 narrowSymbol)', () => {
    const usd = formatMoney(1234.5, 'USD', 'pl')
    expect(usd).toContain('$')
    expect(usd).not.toContain('USD')
  })

  it('formats the other currency/locale pairs', () => {
    expect(formatMoney(10, 'USD', 'en')).toContain('$')
    expect(formatMoney(10, 'USD', 'en')).toContain('10')
    expect(formatMoney(9, 'EUR', 'en')).toContain('€')
    expect(formatMoney(1234.5, 'EUR', 'pl')).toBe(`1234,50${NBSP}€`)
  })

  it('defaults to the en locale', () => {
    expect(formatMoney(5, 'USD')).toBe(formatMoney(5, 'USD', 'en'))
  })

  it('is stable across repeated calls (cached formatter returns identical output)', () => {
    expect(formatMoney(1234.5, 'PLN', 'pl')).toBe(formatMoney(1234.5, 'PLN', 'pl'))
  })
})

describe('formatMoneyCompact', () => {
  it('abbreviates large amounts with the currency symbol (en → "$1.2K")', () => {
    const compact = formatMoneyCompact(1234.5, 'USD', 'en')
    expect(compact).toContain('$')
    expect(compact).toContain('K')
    // Compact is genuinely shorter than the full form for large values.
    expect(compact.length).toBeLessThan(formatMoney(1234567, 'USD', 'en').length)
  })

  it('abbreviates in Polish ("1,5 tys. zł") keeping the local symbol', () => {
    const compact = formatMoneyCompact(1500, 'PLN', 'pl')
    expect(compact).toContain('tys')
    expect(compact).toContain('zł')
    expect(compact).toContain(',') // comma decimal even when compacted
  })
})

describe('CURRENCIES', () => {
  it('lists the three supported currencies', () => {
    expect(CURRENCIES.map(c => c.code)).toEqual(['USD', 'PLN', 'EUR'])
  })
})

describe('isCurrencyCode', () => {
  it('accepts supported currencies only', () => {
    expect(isCurrencyCode('PLN')).toBe(true)
    expect(isCurrencyCode('GBP')).toBe(false)
    expect(isCurrencyCode(null)).toBe(false)
    expect(isCurrencyCode(undefined)).toBe(false)
  })
})

describe('defaultCurrencyForLocale', () => {
  it('maps pl → PLN and everything else → USD', () => {
    expect(defaultCurrencyForLocale('pl')).toBe('PLN')
    expect(defaultCurrencyForLocale('en')).toBe('USD')
    expect(defaultCurrencyForLocale('de')).toBe('USD')
  })
})
