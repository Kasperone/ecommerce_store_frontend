// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Success-page tender rendering + the amount_due-aware payment step. The order
 * is seeded through the mocked `useState('checkout:lastOrder')`. Scope: the
 * stored-value branch — a fully-covered order (amount_due === 0) skips the
 * provider picker entirely and confirms "paid in full"; a partially-covered
 * order pays the remaining `amount_due` (not `total`). GA4 tracking + the
 * provider start calls are exercised elsewhere / by E2E.
 */

const orderRef = ref<Record<string, unknown> | null>(null)

// Only intercept the checkout order state; delegate every other key to the real
// `useState` so composables that rely on it (e.g. `useCookieConsent`, read by
// the google-click-id plugin on page mount) keep working.
mockNuxtImport('useState', (original: any) => (key: string, init?: () => unknown) => {
  if (key !== 'checkout:lastOrder') return original(key, init)
  if (orderRef.value === null && init) orderRef.value = init() as Record<string, unknown> | null
  return orderRef
})

const trackPurchaseOnce = vi.fn()
mockNuxtImport('useEcommerceTracking', () => () => ({ trackPurchaseOnce }))

const PassThrough = defineComponent({ setup: (_p, { slots }) => () => h('div', slots.default?.()) })
// Records the props the page threads in so the amount_due assertion can read them.
const paymentProps: Record<string, unknown>[] = []
const StubPayment = defineComponent({
  props: ['orderId', 'amountMinor', 'currency', 'orderNumber', 'guestToken'],
  setup(props) {
    paymentProps.push(props)
    return () => h('div', { 'data-testid': 'payment-methods' }, 'payment')
  },
})

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    order_number: 'ORD-1',
    total: 100,
    currency: 'USD',
    payment_method: null,
    guest_token: null,
    gift_card_amount: 0,
    store_credit_amount: 0,
    amount_due: 100,
    gift_card_last4: null,
    ...overrides,
  }
}

async function mountPage() {
  const SuccessPage = (await import('./success.vue')).default
  return mountSuspended(SuccessPage, {
    global: {
      stubs: {
        NuxtLayout: PassThrough,
        ClientOnly: PassThrough,
        CheckoutPaymentMethods: StubPayment,
      },
    },
  })
}

beforeEach(() => {
  orderRef.value = null
  paymentProps.length = 0
  trackPurchaseOnce.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('checkout success — amount_due-aware payment', () => {
  it('shows the provider picker charging amount_due (not total) on a partially-covered order', async () => {
    orderRef.value = baseOrder({ gift_card_amount: 30, amount_due: 70, gift_card_last4: '5678' })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="payment-methods"]').exists()).toBe(true)
    // amount_due $70 → 7000 minor units (total would have been 10000).
    expect(paymentProps.at(-1)?.amountMinor).toBe(7000)
  })

  it('skips the provider picker and confirms paid-in-full when amount_due === 0', async () => {
    orderRef.value = baseOrder({ gift_card_amount: 60, store_credit_amount: 40, amount_due: 0, payment_method: 'gift_card' })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="paid-in-full"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="payment-methods"]').exists()).toBe(false)
  })

  it('shows the cash-on-delivery block (no provider) for a COD order with amount due', async () => {
    orderRef.value = baseOrder({ payment_method: 'cod', amount_due: 100 })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="payment-methods"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="paid-in-full"]').exists()).toBe(false)
  })
})

describe('checkout success — tender summary lines', () => {
  it('renders the gift-card line with the masked last4 and the amount-due line', async () => {
    orderRef.value = baseOrder({ gift_card_amount: 30, amount_due: 70, gift_card_last4: '5678' })
    const wrapper = await mountPage()
    const giftCard = wrapper.find('[data-testid="success-gift-card"]')
    expect(giftCard.exists()).toBe(true)
    expect(giftCard.text()).toContain('5678')
    expect(giftCard.text()).toContain('$30.00')
    expect(wrapper.find('[data-testid="success-amount-due"]').text()).toContain('$70.00')
  })

  it('renders the store-credit line when store credit covered part of the order', async () => {
    orderRef.value = baseOrder({ store_credit_amount: 25, amount_due: 75 })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="success-store-credit"]').text()).toContain('$25.00')
  })

  it('shows no tender lines on a plain order (no gift card / store credit)', async () => {
    orderRef.value = baseOrder()
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="success-gift-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="success-store-credit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="success-amount-due"]').exists()).toBe(false)
  })
})
