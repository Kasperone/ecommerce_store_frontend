// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { GuestOrderResponse } from '#shared/types/api'

/**
 * Public guest order-tracking page (/orders/track/[token]).
 *
 * The page fetches `GET /api/v1/orders/track/{token}` via `useAsyncData` +
 * `useApi` (public — deliberately NOT the authed Colada `['orders']`
 * namespace) and renders the trimmed guest view: status badge, items with
 * variant titles, totals, shipment tracking and the destination city/country.
 * An unknown token surfaces the backend 404 through `createError`.
 */

const { apiFetch, createErrorMock, routeParams } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  createErrorMock: vi.fn((opts: unknown) => {
    const err = new Error('createError') as Error & { __opts?: unknown }
    err.__opts = opts
    return err
  }),
  // Mutable: each mount gets a UNIQUE token so the page's keyed `useAsyncData`
  // never serves a previous test's cached payload (the Nuxt test app is shared
  // across mounts within this file).
  routeParams: { token: 'tok-guest-abc' },
}))

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

mockNuxtImport('createError', () => createErrorMock)
mockNuxtImport('useRoute', () => () => ({
  params: routeParams,
  query: {},
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function makeOrder(overrides: Partial<GuestOrderResponse> = {}): GuestOrderResponse {
  return {
    order_number: 'ORD-20260608-0001',
    status: 'paid',
    created_at: '2026-06-08T10:00:00Z',
    items: [
      {
        product_name: 'Widget',
        variant_title: 'Red / XL',
        quantity: 1,
        unit_price: 10,
        total_price: 10,
      },
      {
        product_name: 'Gadget',
        variant_title: null,
        quantity: 2,
        unit_price: 5,
        total_price: 10,
      },
    ],
    subtotal: 20,
    discount: 0,
    shipping: 4.5,
    total: 24.5,
    currency: 'USD',
    shipping_method_name: 'DHL Standard',
    shipping_carrier: 'DHL',
    tracking_number: 'JD0123456789',
    tracking_url: 'https://track.example.com/JD0123456789',
    shipping_city: 'Warsaw',
    shipping_country: 'PL',
    gift_card_amount: 0,
    store_credit_amount: 0,
    amount_due: 24.5,
    ...overrides,
  }
}

async function mountPage() {
  const Page = (await import('./[token].vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

let tokenCounter = 0

beforeEach(() => {
  routeParams.token = `tok-guest-${++tokenCounter}`
  apiFetch.mockReset()
  createErrorMock.mockClear()
})

describe('guest order tracking page', () => {
  it('fetches the public track endpoint with the token from the URL', async () => {
    routeParams.token = 'tok-guest-abc'
    apiFetch.mockResolvedValue(makeOrder())
    await mountPage()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/track/tok-guest-abc')
  })

  it('renders order number, status, items with variant titles and totals', async () => {
    apiFetch.mockResolvedValue(makeOrder())
    const wrapper = await mountPage()
    const text = wrapper.text()

    expect(text).toContain('ORD-20260608-0001')
    expect(text).toContain('Paid')
    expect(text).toContain('Widget')
    expect(text).toContain('Gadget')
    expect(wrapper.find('[data-testid="track-item-variant"]').text()).toBe('Red / XL')
    expect(text).toContain('$24.50')
  })

  it('renders the shipment tracking block with the carrier link', async () => {
    apiFetch.mockResolvedValue(makeOrder())
    const wrapper = await mountPage()

    const tracking = wrapper.find('[data-testid="order-tracking"]')
    expect(tracking.exists()).toBe(true)
    expect(tracking.text()).toContain('DHL')
    expect(tracking.text()).toContain('JD0123456789')
    expect(wrapper.find('[data-testid="order-tracking-link"]').attributes('href'))
      .toBe('https://track.example.com/JD0123456789')
  })

  it('omits the tracking block before the order ships', async () => {
    apiFetch.mockResolvedValue(makeOrder({
      status: 'pending',
      shipping_carrier: null,
      tracking_number: null,
      tracking_url: null,
    }))
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="order-tracking"]').exists()).toBe(false)
  })

  it('shows the destination city/country (never the full address)', async () => {
    apiFetch.mockResolvedValue(makeOrder())
    const wrapper = await mountPage()
    const shipsTo = wrapper.find('[data-testid="track-ships-to"]')
    expect(shipsTo.exists()).toBe(true)
    expect(shipsTo.text()).toContain('Warsaw')
    expect(shipsTo.text()).toContain('PL')
  })

  it('shows the discount row only when a discount was applied', async () => {
    apiFetch.mockResolvedValue(makeOrder({ discount: 5 }))
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="track-discount"]').exists()).toBe(true)

    // Fresh token → fresh useAsyncData key for the second mount.
    routeParams.token = `tok-guest-${++tokenCounter}`
    apiFetch.mockResolvedValue(makeOrder({ discount: 0 }))
    const second = await mountPage()
    expect(second.find('[data-testid="track-discount"]').exists()).toBe(false)
  })

  it('throws a 404 createError on an unknown token', async () => {
    apiFetch.mockRejectedValue({ data: { detail: 'Order not found' }, status: 404 })
    await expect(mountPage()).rejects.toThrow()
    expect(createErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    )
  })
})
