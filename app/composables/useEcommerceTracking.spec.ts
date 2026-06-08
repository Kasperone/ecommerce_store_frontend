import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `useEcommerceTracking` invariants: event name + param shapes (item_id scheme,
 * currency/value), the no-op-when-unconfigured guard, and purchase dedup
 * (once per order_number across success + return pages).
 *
 * All auto-imports the composable touches are mocked so no Nuxt app context /
 * network is needed; `gtag` is a spy whose calls we assert on.
 */

const { gtagSpy, tagsState, currencyRef, localeRef, userRef, runtimePublic } = vi.hoisted(() => ({
  gtagSpy: vi.fn(),
  tagsState: { enabled: true, ads: 'AW-123' },
  currencyRef: { value: 'USD' as 'USD' | 'PLN' | 'EUR' },
  localeRef: { value: 'en' },
  userRef: { value: null as { email?: string } | null },
  runtimePublic: {
    ga4Id: 'G-TEST',
    adsId: 'AW-123',
    adsPurchaseLabel: 'LABEL',
    merchantId: 'MID',
  } as Record<string, string>,
}))

mockNuxtImport('useGoogleTags', () => () => ({
  gtag: gtagSpy,
  consentUpdate: vi.fn(),
  ads: tagsState.ads,
  ga4: 'G-TEST',
  enabled: tagsState.enabled,
}))
mockNuxtImport('useCurrencyPreference', () => () => ({ currency: currencyRef }))
mockNuxtImport('useI18n', () => () => ({ locale: localeRef }))
mockNuxtImport('useAuthStore', () => () => ({ user: userRef.value }))
mockNuxtImport('useRuntimeConfig', () => () => ({ public: runtimePublic }))

async function load() {
  const mod = await import('./useEcommerceTracking')
  return mod.useEcommerceTracking
}

function cartItem(over: Record<string, unknown> = {}) {
  return {
    productId: 5,
    variantId: null,
    slug: 'thing',
    name: 'Thing',
    sku: 'SKU-5',
    imageUrl: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 3,
    allowBackorder: false,
    quantity: 2,
    ...over,
  } as never
}

function order(over: Record<string, unknown> = {}) {
  return {
    order_number: 'ORD-1',
    total: 25,
    currency: 'USD',
    tax: 2,
    shipping: 3,
    coupon_code: 'SAVE',
    items: [
      { product_id: 5, product_sku: 'SKU-5', product_name: 'Thing', unit_price: 10, quantity: 2 },
      { product_id: 6, product_sku: null, product_name: 'Other', unit_price: 5, quantity: 1 },
    ],
    ...over,
  } as never
}

function lastEvent(name: string) {
  const calls = gtagSpy.mock.calls.filter(c => c[0] === 'event' && c[1] === name)
  return calls.length ? calls[calls.length - 1]![2] : undefined
}

beforeEach(() => {
  gtagSpy.mockReset()
  tagsState.enabled = true
  tagsState.ads = 'AW-123'
  currencyRef.value = 'USD'
  localeRef.value = 'en'
  userRef.value = null
  runtimePublic.ga4Id = 'G-TEST'
  runtimePublic.adsId = 'AW-123'
  runtimePublic.adsPurchaseLabel = 'LABEL'
  runtimePublic.merchantId = 'MID'
  localStorage.clear()
})

describe('item_id scheme', () => {
  it('add_to_cart uses sku when present and the active currency price', async () => {
    const t = (await load())()
    t.addToCart(cartItem())
    const ev = lastEvent('add_to_cart')
    expect(ev.currency).toBe('USD')
    expect(ev.value).toBe(20) // price 10 × qty 2
    expect(ev.items[0].item_id).toBe('SKU-5')
    expect(ev.items[0].quantity).toBe(2)
  })

  it('falls back to prod_{id} when the line has no sku', async () => {
    const t = (await load())()
    t.addToCart(cartItem({ sku: null }))
    expect(lastEvent('add_to_cart').items[0].item_id).toBe('prod_5')
  })

  it('uses the PLN price when currency is PLN', async () => {
    currencyRef.value = 'PLN'
    const t = (await load())()
    t.addToCart(cartItem())
    const ev = lastEvent('add_to_cart')
    expect(ev.currency).toBe('PLN')
    expect(ev.value).toBe(80) // 40 × 2
  })
})

describe('event shapes', () => {
  it('begin_checkout sums the cart value and forwards the coupon', async () => {
    const t = (await load())()
    t.beginCheckout([cartItem(), cartItem({ productId: 6, sku: 'SKU-6', quantity: 1 })], 'SAVE')
    const ev = lastEvent('begin_checkout')
    expect(ev.value).toBe(30) // 20 + 10
    expect(ev.coupon).toBe('SAVE')
    expect(ev.items).toHaveLength(2)
  })

  it('view_item_list maps a list with index + list context', async () => {
    const t = (await load())()
    t.viewItemList(
      [{ id: 9, name: 'P', sku: 'S9', price_usd: 3, price_pln: null, price_eur: null } as never],
      { id: 'catalog', name: 'Products' },
    )
    const ev = lastEvent('view_item_list')
    expect(ev.item_list_id).toBe('catalog')
    expect(ev.items[0].item_id).toBe('S9')
    expect(ev.items[0].index).toBe(0)
  })

  it('purchase maps order → transaction_id/value/items with the id scheme', async () => {
    const t = (await load())()
    t.purchase(order())
    const ev = lastEvent('purchase')
    expect(ev.transaction_id).toBe('ORD-1')
    expect(ev.value).toBe(25)
    expect(ev.tax).toBe(2)
    expect(ev.coupon).toBe('SAVE')
    expect(ev.items[0].item_id).toBe('SKU-5')
    expect(ev.items[1].item_id).toBe('prod_6')
  })
})

describe('no-op when unconfigured', () => {
  it('emits nothing when ga4 is disabled', async () => {
    tagsState.enabled = false
    const t = (await load())()
    t.addToCart(cartItem())
    t.viewItem({ id: 1, name: 'X', sku: 'S', price_usd: 1, price_pln: null, price_eur: null } as never)
    t.purchase(order())
    expect(gtagSpy).not.toHaveBeenCalled()
  })
})

describe('purchase dedup', () => {
  it('fires GA4 purchase + Ads conversion once, then skips a duplicate', async () => {
    const t = (await load())()
    expect(t.trackPurchaseOnce(order())).toBe(true)

    const purchases = gtagSpy.mock.calls.filter(c => c[0] === 'event' && c[1] === 'purchase')
    const conversions = gtagSpy.mock.calls.filter(c => c[0] === 'event' && c[1] === 'conversion')
    // GA4 purchase + Ads cart-data purchase = 2 'purchase' events; 1 conversion.
    expect(purchases.length).toBe(2)
    expect(conversions.length).toBe(1)
    expect(conversions[0]![2].send_to).toBe('AW-123/LABEL')
    expect(conversions[0]![2].transaction_id).toBe('ORD-1')

    gtagSpy.mockReset()
    expect(t.trackPurchaseOnce(order())).toBe(false)
    expect(gtagSpy).not.toHaveBeenCalled()
  })

  it('the minimal helper dedups against the same order_number', async () => {
    const t = (await load())()
    expect(t.trackPurchaseOnce(order())).toBe(true)
    gtagSpy.mockReset()
    // Same order via the return-page minimal path → no second fire.
    expect(t.trackPurchaseOnceMinimal({ order_number: 'ORD-1', total: 25, currency: 'USD' })).toBe(false)
    expect(gtagSpy).not.toHaveBeenCalled()
  })

  it('sets hashed user_data before the Ads conversion when authed', async () => {
    userRef.value = { email: 'buyer@example.com' }
    const t = (await load())()
    t.trackPurchaseOnce(order())
    const setCall = gtagSpy.mock.calls.find(c => c[0] === 'set' && c[1] === 'user_data')
    expect(setCall).toBeTruthy()
    expect(setCall![2].email).toBe('buyer@example.com')
  })

  it('skips the Ads conversion when the purchase label is unconfigured', async () => {
    runtimePublic.adsPurchaseLabel = ''
    const t = (await load())()
    t.trackPurchaseOnce(order())
    const conversions = gtagSpy.mock.calls.filter(c => c[0] === 'event' && c[1] === 'conversion')
    expect(conversions.length).toBe(0)
    // GA4 purchase still fires.
    expect(lastEvent('purchase')).toBeTruthy()
  })
})
