import type { CartItem } from '~/stores/cart'
import type { OrderResponse, ProductVariantPublic } from '#shared/types/api'
import { selectPrice } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { analyticsItemId, feedMarketFor } from '#shared/utils/analyticsItem'

/**
 * GA4 ecommerce + Google Ads conversion tracking (Pillars C + D).
 *
 * The SINGLE surface that emits `gtag('event', …)` for commerce. Maps our
 * domain objects (products, cart lines, orders) → GA4 `items[]` and guards
 * consent + SSR + the configured-id check + purchase dedup in one place.
 *
 * Gating: every call is a no-op unless `import.meta.client && enabled` (a
 * non-empty `ga4Id`). Consent Mode v2 does the real analytics/ads gating
 * automatically once the denied-default + bridge are live (so even a fired
 * event runs in cookieless/modeled mode until consent), but we still guard so
 * nothing builds payloads or throws when unconfigured.
 *
 * item_id scheme (everywhere): `sku ?? prod_{productId}` via `analyticsItemId`
 * — identical to the Merchant Center feed id and the Ads `id`.
 *
 * value/currency: the active `CurrencyCode` from `useCurrencyPreference()` +
 * `selectPrice()` for catalog events; `OrderResponse.total`/`unit_price` for
 * purchase (no runtime FX — per-currency columns are authoritative).
 */

type PricedLike = Parameters<typeof selectPrice>[0]
// Structural minimum for list/item events: an id + name + sku + the three
// price columns. Satisfied by ProductResponse, ProductWithCategory AND
// SearchResultItem (search results) without coupling to a single schema.
type ProductLike = PricedLike & {
  id: number
  name: string
  sku?: string | null
}

interface Ga4Item {
  item_id: string
  item_name: string
  price: number
  quantity: number
  index?: number
  item_list_id?: string
  item_list_name?: string
}

const PURCHASE_KEY_PREFIX = 'ga_purchased:'

export function useEcommerceTracking() {
  const { gtag, ads, enabled: tagsEnabled } = useGoogleTags()
  const { currency } = useCurrencyPreference()
  const { locale } = useI18n()
  const authStore = useAuthStore()
  const cfg = useRuntimeConfig().public

  const enabled = () => import.meta.client && tagsEnabled

  function priceOf(p: PricedLike): number {
    return selectPrice(p, currency.value)?.amount ?? 0
  }

  function event(name: string, params: Record<string, unknown>) {
    if (!enabled()) return
    gtag('event', name, params)
  }

  // --- item mappers --------------------------------------------------------
  function itemFromCart(ci: CartItem, index?: number): Ga4Item {
    return {
      item_id: analyticsItemId(ci.sku, ci.productId),
      item_name: ci.name,
      price: priceOf(ci),
      quantity: ci.quantity,
      ...(index != null ? { index } : {}),
    }
  }

  function itemFromProduct(
    p: ProductLike,
    quantity = 1,
    variant?: ProductVariantPublic | null,
    index?: number,
    list?: { id?: string, name?: string },
  ): Ga4Item {
    const priced = (variant ?? p) as PricedLike
    return {
      item_id: analyticsItemId(variant?.sku ?? p.sku, p.id),
      item_name: p.name,
      price: priceOf(priced),
      quantity,
      ...(index != null ? { index } : {}),
      ...(list?.id ? { item_list_id: list.id } : {}),
      ...(list?.name ? { item_list_name: list.name } : {}),
    }
  }

  function sumValue(items: Ga4Item[]): number {
    return items.reduce((s, it) => s + it.price * it.quantity, 0)
  }

  // --- catalog events ------------------------------------------------------
  function viewItem(p: ProductLike, variant?: ProductVariantPublic | null) {
    const item = itemFromProduct(p, 1, variant)
    event('view_item', { currency: currency.value, value: item.price, items: [item] })
  }

  function viewItemList(products: ProductLike[], list?: { id?: string, name?: string }) {
    if (!products.length) return
    event('view_item_list', {
      ...(list?.id ? { item_list_id: list.id } : {}),
      ...(list?.name ? { item_list_name: list.name } : {}),
      items: products.map((p, i) => itemFromProduct(p, 1, null, i, list)),
    })
  }

  function selectItem(p: ProductLike, list?: { id?: string, name?: string }, index?: number) {
    event('select_item', {
      ...(list?.id ? { item_list_id: list.id } : {}),
      ...(list?.name ? { item_list_name: list.name } : {}),
      items: [itemFromProduct(p, 1, null, index, list)],
    })
  }

  // --- cart events ---------------------------------------------------------
  function addToCart(ci: CartItem) {
    const item = itemFromCart(ci)
    event('add_to_cart', { currency: currency.value, value: item.price * item.quantity, items: [item] })
  }

  function removeFromCart(ci: CartItem) {
    const item = itemFromCart(ci)
    event('remove_from_cart', { currency: currency.value, value: item.price * item.quantity, items: [item] })
  }

  function viewCart(items: CartItem[]) {
    const mapped = items.map((ci, i) => itemFromCart(ci, i))
    event('view_cart', { currency: currency.value, value: sumValue(mapped), items: mapped })
  }

  // --- checkout funnel -----------------------------------------------------
  function beginCheckout(items: CartItem[], coupon?: string) {
    const mapped = items.map((ci, i) => itemFromCart(ci, i))
    event('begin_checkout', {
      currency: currency.value,
      value: sumValue(mapped),
      ...(coupon ? { coupon } : {}),
      items: mapped,
    })
  }

  function addShippingInfo(items: CartItem[], shippingTier?: string, coupon?: string) {
    const mapped = items.map((ci, i) => itemFromCart(ci, i))
    event('add_shipping_info', {
      currency: currency.value,
      value: sumValue(mapped),
      ...(shippingTier ? { shipping_tier: shippingTier } : {}),
      ...(coupon ? { coupon } : {}),
      items: mapped,
    })
  }

  function addPaymentInfo(items: CartItem[], paymentType?: string, coupon?: string) {
    const mapped = items.map((ci, i) => itemFromCart(ci, i))
    event('add_payment_info', {
      currency: currency.value,
      value: sumValue(mapped),
      ...(paymentType ? { payment_type: paymentType } : {}),
      ...(coupon ? { coupon } : {}),
      items: mapped,
    })
  }

  // --- purchase (GA4 + Ads, deduped once per order) ------------------------
  function purchaseKey(orderNumber: string): string {
    return `${PURCHASE_KEY_PREFIX}${orderNumber}`
  }

  /** True once this order's purchase has already been tracked (per-browser). */
  function alreadyPurchased(orderNumber: string): boolean {
    if (!import.meta.client) return true
    try {
      return localStorage.getItem(purchaseKey(orderNumber)) === '1'
    }
    catch {
      return false
    }
  }

  function markPurchased(orderNumber: string) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(purchaseKey(orderNumber), '1')
    }
    catch {
      // Storage blocked — dedup degrades to once-per-page-instance via the
      // in-memory guard the callers already hold; acceptable.
    }
  }

  /** Map an order's lines to GA4 items[]. */
  function orderItems(order: OrderResponse): Ga4Item[] {
    return (order.items ?? []).map((it, i) => ({
      item_id: analyticsItemId(it.product_sku, it.product_id),
      item_name: it.product_name,
      index: i,
      price: it.unit_price,
      quantity: it.quantity,
    }))
  }

  /** The GA4 `purchase` event (always, when enabled). */
  function gaPurchase(order: OrderResponse) {
    event('purchase', {
      transaction_id: order.order_number,
      value: order.total,
      currency: order.currency,
      tax: order.tax,
      shipping: order.shipping,
      ...(order.coupon_code ? { coupon: order.coupon_code } : {}),
      items: orderItems(order),
    })
  }

  /**
   * Ads purchase conversion + cart-data variant (Pillar D). Only when both
   * `adsId` and `adsPurchaseLabel` are configured. Enhanced Conversions:
   * `gtag('set','user_data', { email })` is set BEFORE the conversion when the
   * buyer is authenticated — gtag hashes (SHA-256) client-side. Consent Mode's
   * `ad_user_data` signal (granted only on marketing consent) governs whether
   * the hashed data is actually used, so no extra guard is needed here.
   *
   * Remarketing: we deliberately rely on the GA4-audience route — the GA4
   * events above already carry `items[]`, so GA4 audiences (cart abandoners,
   * product viewers) shared to Ads cover dynamic remarketing with NO extra
   * classic-remarketing tags. Documented choice (plan §7.4).
   */
  function adsPurchase(order: OrderResponse) {
    const adsLabel = (cfg.adsPurchaseLabel as string) || ''
    const merchantId = (cfg.merchantId as string) || ''
    if (!ads || !adsLabel) return

    // Enhanced Conversions — set user_data before the conversion fires.
    const email = authStore.user?.email
    if (email) {
      gtag('set', 'user_data', { email })
    }

    // The direct Ads purchase conversion (value-based bidding).
    gtag('event', 'conversion', {
      send_to: `${ads}/${adsLabel}`,
      value: order.total,
      currency: order.currency,
      transaction_id: order.order_number,
    })

    // The cart-data "purchase" variant — links the conversion to the feed so
    // Shopping/PMax can optimize. aw_feed_country/language derive from the
    // buyer's currency + locale (matches the per-market Merchant Center feeds).
    const market = feedMarketFor(order.currency as CurrencyCode, locale.value)
    gtag('event', 'purchase', {
      send_to: ads,
      value: order.total,
      currency: order.currency,
      transaction_id: order.order_number,
      ...(merchantId ? { aw_merchant_id: merchantId } : {}),
      aw_feed_country: market.country,
      aw_feed_language: market.language,
      items: (order.items ?? []).map(it => ({
        id: analyticsItemId(it.product_sku, it.product_id),
        quantity: it.quantity,
        price: it.unit_price,
      })),
    })
  }

  /**
   * Fire the purchase (GA4 + Ads) exactly once per `order_number`, across both
   * `checkout/success.vue` and `checkout/payment/return.vue`. Returns true if it
   * fired, false if it was a duplicate / disabled / no order.
   */
  function trackPurchaseOnce(order: OrderResponse | null | undefined): boolean {
    if (!order || !enabled()) return false
    if (alreadyPurchased(order.order_number)) return false
    markPurchased(order.order_number)
    gaPurchase(order)
    adsPurchase(order)
    return true
  }

  /**
   * Minimal purchase shape for the hosted-redirect return page, where only a
   * trimmed order is available (no full OrderResponse). value/currency/
   * transaction_id are the load-bearing conversion fields; items[] is optional
   * (the guest tracking view carries no product ids → omit rather than guess).
   * Deduped against `trackPurchaseOnce` by the same `order_number` key.
   */
  interface MinimalOrder {
    order_number: string
    total: number
    currency: string
    tax?: number
    shipping?: number
    coupon_code?: string | null
    items?: Ga4Item[]
  }

  function trackPurchaseOnceMinimal(order: MinimalOrder | null | undefined): boolean {
    if (!order || !enabled()) return false
    if (alreadyPurchased(order.order_number)) return false
    markPurchased(order.order_number)
    event('purchase', {
      transaction_id: order.order_number,
      value: order.total,
      currency: order.currency,
      ...(order.tax != null ? { tax: order.tax } : {}),
      ...(order.shipping != null ? { shipping: order.shipping } : {}),
      ...(order.coupon_code ? { coupon: order.coupon_code } : {}),
      ...(order.items?.length ? { items: order.items } : {}),
    })
    // Ads conversion needs the same minimal value/currency/transaction_id.
    const adsLabel = (cfg.adsPurchaseLabel as string) || ''
    if (ads && adsLabel) {
      const email = authStore.user?.email
      if (email) gtag('set', 'user_data', { email })
      gtag('event', 'conversion', {
        send_to: `${ads}/${adsLabel}`,
        value: order.total,
        currency: order.currency,
        transaction_id: order.order_number,
      })
    }
    return true
  }

  return {
    enabled,
    // catalog
    viewItem,
    viewItemList,
    selectItem,
    // cart
    addToCart,
    removeFromCart,
    viewCart,
    // checkout funnel
    beginCheckout,
    addShippingInfo,
    addPaymentInfo,
    // purchase
    purchase: gaPurchase,
    trackPurchaseOnce,
    trackPurchaseOnceMinimal,
  }
}
