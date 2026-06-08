/**
 * Analytics product-identifier scheme + feed-market mapping (Pillars C/D).
 *
 * THE single id scheme used everywhere a Google surface references a product:
 *   GA4 `item_id` == Merchant Center feed `id` == Ads `id` == remarketing
 *   `ecomm_prodid` == `sku` when present, else `prod_{productId}`.
 *
 * Pure + dependency-free so it's unit-testable and identical on every call
 * site (cart events, purchase, Ads conversion cart-data).
 */

import type { CurrencyCode } from './money'

/** `sku ?? prod_{productId}` — the canonical item/feed id. */
export function analyticsItemId(sku: string | null | undefined, productId: number): string {
  const trimmed = sku?.trim()
  return trimmed ? trimmed : `prod_${productId}`
}

export interface FeedMarket {
  /** `aw_feed_country` — ISO 3166-1 alpha-2 of the feed the buyer's market uses. */
  country: string
  /** `aw_feed_language` — ISO 639-1 of the feed the buyer's market uses. */
  language: string
}

/**
 * Derive the Ads cart-data feed market from the buyer's currency + UI locale,
 * matching the per-(country, language, currency) Merchant Center feeds:
 *   - PLN          → PL / pl
 *   - EUR          → DE / en  (the chosen EUR target country)
 *   - USD (en)     → US / en
 * Locale only refines PLN vs the rest; an unknown currency falls back to US/en.
 */
export function feedMarketFor(currency: CurrencyCode, locale: string): FeedMarket {
  switch (currency) {
    case 'PLN':
      return { country: 'PL', language: 'pl' }
    case 'EUR':
      return { country: 'DE', language: 'en' }
    case 'USD':
    default:
      return { country: 'US', language: locale === 'pl' ? 'pl' : 'en' }
  }
}
