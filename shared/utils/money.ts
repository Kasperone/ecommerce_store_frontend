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

// Loose on purpose: products carry `number | null` columns while variant
// publics (`ProductVariantPublic`) have optional fields — `!= null` below
// treats null and undefined the same.
type PricedProduct = {
  price_usd?: number | null
  price_pln?: number | null
  price_eur?: number | null
}

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
 * How the currency unit is rendered. `'narrowSymbol'` prefers the compact
 * local symbol (`zł` / `$` / `€`) over the ISO code in every locale — so an
 * English visitor viewing PLN sees `zł 1,234.50` rather than `PLN 1,234.50`.
 * For a mainly-Polish storefront the local symbol reads more like a price.
 * Change this one constant to flip the whole store's symbol style.
 */
const CURRENCY_DISPLAY: Intl.NumberFormatOptions['currencyDisplay'] = 'narrowSymbol'

/**
 * Cache one `Intl.NumberFormat` per (locale, currency, compact) tuple.
 * Constructing the formatter is the expensive part of the Intl API; a PLP or
 * cart paints dozens of prices that all share a handful of formatters, so
 * building a fresh instance on every `formatMoney` call is wasted work.
 */
const fmtCache = new Map<string, Intl.NumberFormat>()
function fmt(locale: string, currency: CurrencyCode, compact: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${compact}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: CURRENCY_DISPLAY,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    })
    fmtCache.set(key, f)
  }
  return f
}

/**
 * Format an amount as currency. `locale` drives grouping/decimal separators
 * (e.g. `pl` → "79,99 zł", `en` → "zł 79.99" — see {@link CURRENCY_DISPLAY}).
 */
export function formatMoney(amount: number, currency: CurrencyCode, locale = 'en'): string {
  return fmt(locale, currency, false).format(amount)
}

/**
 * Compact currency for tight spaces like chart axis ticks (e.g. `1,2 tys. zł`
 * for `pl`, `$1.2K` for `en`). Full-precision values belong in tooltips and
 * table cells; this is display-only shorthand. Same symbol style as
 * {@link formatMoney}.
 */
export function formatMoneyCompact(amount: number, currency: CurrencyCode, locale = 'en'): string {
  return fmt(locale, currency, true).format(amount)
}

/** First-visit currency default derived from the UI locale: pl → PLN, else USD. */
export function defaultCurrencyForLocale(locale: string): CurrencyCode {
  return locale === 'pl' ? 'PLN' : 'USD'
}
