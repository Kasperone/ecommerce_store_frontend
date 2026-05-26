/**
 * Storefront price selection + formatting.
 *
 * Products carry three nullable price columns (`price_usd`, `price_pln`,
 * `price_eur`). The storefront shows a single chosen currency (see
 * `useCurrencyPreference`), so this module picks the right column for that
 * currency — falling back through USD→PLN→EUR when the chosen column is null
 * (the backend guarantees at least one price), and formats via `Intl`.
 *
 * We deliberately use `Intl.NumberFormat` directly rather than vue-i18n's
 * `$n(value, 'currency')`: the project defines no `currency` numberFormat, so
 * `$n` renders empty (the admin product list hit the same and uses Intl too).
 */

import type { ProductResponse } from '#shared/types/api'

export type CurrencyCode = 'USD' | 'PLN' | 'EUR'

export const CURRENCIES: { code: CurrencyCode, symbol: string }[] = [
  { code: 'USD', symbol: '$' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'EUR', symbol: '€' },
]

/** The product price column that backs each currency. */
const PRICE_FIELD: Record<CurrencyCode, 'price_usd' | 'price_pln' | 'price_eur'> = {
  USD: 'price_usd',
  PLN: 'price_pln',
  EUR: 'price_eur',
}

// Fallback order when the chosen currency's column is null — mirrors the backend
// `Product.get_price()` priority (chosen first, then USD→PLN→EUR).
const FALLBACK_ORDER: CurrencyCode[] = ['USD', 'PLN', 'EUR']

type PricedProduct = Pick<ProductResponse, 'price_usd' | 'price_pln' | 'price_eur'>

export interface SelectedPrice {
  amount: number
  /** The currency actually used — may differ from the requested one on fallback. */
  currency: CurrencyCode
}

/**
 * Pick the price to display for `currency`. Falls back through USD→PLN→EUR when
 * that column is null. Returns null only when the product has no price at all
 * (which the backend's at-least-one-price CHECK prevents for persisted rows).
 */
export function selectPrice(product: PricedProduct, currency: CurrencyCode): SelectedPrice | null {
  const direct = product[PRICE_FIELD[currency]]
  if (direct != null) return { amount: direct, currency }

  for (const code of FALLBACK_ORDER) {
    const amount = product[PRICE_FIELD[code]]
    if (amount != null) return { amount, currency: code }
  }
  return null
}

/**
 * Format an amount as currency. `locale` drives grouping/decimal separators
 * (e.g. `pl` → "79,99 zł", `en` → "PLN 79.99").
 */
export function formatMoney(amount: number, currency: CurrencyCode, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

/** First-visit currency default derived from the UI locale: pl → PLN, else USD. */
export function defaultCurrencyForLocale(locale: string): CurrencyCode {
  return locale === 'pl' ? 'PLN' : 'USD'
}
