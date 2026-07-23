// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { Address } from '~/composables/queries/useAddresses'

/**
 * Checkout shipping-address prefill from the saved address book + guest
 * checkout (anonymous buyers get a required contact-email field and the order
 * payload gains `guest_email` + `locale`).
 *
 * Scope of THIS spec: the saved-address picker + shipping-form prefill wiring
 * and the guest de-gating. The cart store, currency preference, create-order
 * mutation and the shipping-method selector are stubbed/mocked at their
 * boundaries; the rest of checkout (coupon/payment/summary) is covered
 * elsewhere + by E2E.
 */

const ADDRESSES: Address[] = [
  {
    id: 1,
    created_at: '2026-05-28T10:00:00Z',
    updated_at: '2026-05-28T10:00:00Z',
    label: 'Home',
    recipient_name: 'Jane Doe',
    street: '1 Main St',
    city: 'Warsaw',
    postal_code: '00-001',
    country: 'PL',
    state: null,
    phone: null,
    is_default_shipping: true,
    is_default_billing: true,
    user_id: 7,
  },
  {
    id: 2,
    created_at: '2026-05-27T09:00:00Z',
    updated_at: '2026-05-27T09:00:00Z',
    label: 'Office',
    recipient_name: 'Jane Doe',
    street: '99 Market Rd',
    city: 'Berlin',
    postal_code: '10115',
    country: 'DE',
    state: null,
    phone: null,
    is_default_shipping: false,
    is_default_billing: false,
    user_id: 7,
  },
]

const addressesData = ref<Address[]>(ADDRESSES)

const { mutateAsync, mockNavigate, authState, cartState } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mockNavigate: vi.fn(),
  // Mutable auth stand-in: set `isAuthenticated` per test BEFORE mounting (the
  // page reads it at render — auth state is settled pre-mount in the real app).
  authState: { isAuthenticated: true },
  // Mutable cart stand-in: the default is a mixed physical cart; the
  // all-gift-card tests swap `cartState.items` before mounting.
  cartState: { items: [] as Array<Record<string, unknown>> },
}))

// Default mixed physical cart (one variant + one variantless line) so the order
// grid + shipping form render and the payload test covers both line shapes.
const PHYSICAL_LINES: Array<Record<string, unknown>> = [
  {
    productId: 10, variantId: 7, variantTitle: 'Red / XL', variantTitlePl: null,
    slug: 'widget', name: 'Widget', imageUrl: null,
    price_usd: 10, price_pln: 40, price_eur: 9, stock: 5, allowBackorder: false,
    quantity: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
  },
  {
    productId: 11, slug: 'gadget', name: 'Gadget', imageUrl: null,
    price_usd: 5, price_pln: 20, price_eur: 4, stock: 5, allowBackorder: false,
    quantity: 2, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
  },
]

// An all-gift-card (digital) cart — every line is a gift-card product with its
// per-line delivery fields.
const GIFT_LINES: Array<Record<string, unknown>> = [
  {
    productId: 20, variantId: 50, variantTitle: '$50', variantTitlePl: null,
    slug: 'gift-card', name: 'Gift Card', imageUrl: null,
    price_usd: 50, price_pln: 200, price_eur: 45, stock: 999, allowBackorder: false,
    quantity: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
    isGiftCard: true, giftCardRecipientEmail: 'friend@example.com', giftCardMessage: 'Enjoy!',
  },
]

vi.mock('~/composables/queries/useAddresses', () => ({
  useAddressesQuery: () => ({ data: addressesData, isLoading: ref(false) }),
}))

vi.mock('~/composables/queries/useOrderQueries', () => ({
  useCreateOrder: () => ({ mutateAsync, isLoading: ref(false) }),
}))

mockNuxtImport('navigateTo', () => mockNavigate)

// Cart reads from the mutable `cartState` (default: the mixed physical cart).
mockNuxtImport('useCartStore', () => () => ({
  get items() {
    return cartState.items
  },
  get isEmpty() {
    return cartState.items.length === 0
  },
  clear: vi.fn(),
}))

mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: ref('USD'),
}))

mockNuxtImport('useAuthStore', () => () => ({
  user: null,
  isImpersonating: false,
  get isAuthenticated() {
    return authState.isAuthenticated
  },
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

// Stub the non-address checkout collaborators so the page mounts in isolation.
const StubSelector = defineComponent({ setup: () => () => h('div', 'method-selector') })
// Props declared so the discounts tests can assert what the page threads in
// (`shippingAmount`) and emit applied coupons back up (`update:modelValue`).
const StubCoupon = defineComponent({
  props: ['subtotal', 'shippingAmount', 'currency', 'modelValue'],
  emits: ['update:modelValue'],
  setup: () => () => h('div', 'coupon'),
})
// Tender fields self-gate on public toggles / auth / balance (covered by their
// own specs); here they're stubbed so the page's summary + payload wiring is
// tested by driving their emits.
const StubGiftCard = defineComponent({
  props: ['currency', 'orderTotal', 'modelValue'],
  emits: ['update:modelValue'],
  setup: () => () => h('div', 'gift-card'),
})
const StubStoreCredit = defineComponent({
  props: ['currency', 'remaining', 'modelValue'],
  emits: ['update:modelValue', 'update:applied'],
  setup: () => () => h('div', 'store-credit'),
})

const tick = () => new Promise(r => setTimeout(r, 0))

const mounted: { unmount: () => void }[] = []

async function mountPage() {
  const CheckoutPage = (await import('./index.vue')).default
  const wrapper = await mountSuspended(CheckoutPage, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        ClientOnly: PassThroughStub,
        CheckoutShippingMethodSelector: StubSelector,
        CheckoutCouponField: StubCoupon,
        CheckoutGiftCardField: StubGiftCard,
        CheckoutStoreCreditField: StubStoreCredit,
      },
    },
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  addressesData.value = ADDRESSES
  authState.isAuthenticated = true
  cartState.items = [...PHYSICAL_LINES]
  mutateAsync.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  // Unmount each wrapper so Vue tears down its (possibly teleported) nodes cleanly
  // BEFORE the DOM is wiped. Clearing document.body first leaves Vue holding
  // detached nodes; a deferred patch then reads `nextSibling` of a node whose
  // parent is gone and throws an unhandled TypeError (happy-dom teleport gotcha) —
  // which passes locally but fails the CI Vitest job.
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
})

describe('checkout — saved-address prefill', () => {
  it('renders the saved-address picker when the customer has addresses', async () => {
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.text()).toContain('Use a saved address')
  })

  it('prefills the shipping form from the default-shipping address', async () => {
    const wrapper = await mountPage()
    await tick()
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    expect(form.props('initial')).toMatchObject({
      address: '1 Main St',
      city: 'Warsaw',
      postalCode: '00-001',
      country: 'PL',
    })
  })

  it('re-prefills when a different saved address is picked', async () => {
    const wrapper = await mountPage()
    await tick()
    const picker = wrapper.findComponent({ name: 'AccountAddressesAddressPicker' })
    picker.vm.$emit('update:modelValue', 2)
    await tick()
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    expect(form.props('initial')).toMatchObject({
      address: '99 Market Rd',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
  })

  it('hides the picker and prefills empty when there are no saved addresses', async () => {
    addressesData.value = []
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.text()).not.toContain('Use a saved address')
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    expect(form.props('initial')).toMatchObject({ address: '', city: '', postalCode: '', country: '' })
  })
})

describe('checkout — order payload (variants F2)', () => {
  it('shows the variant title on the summary line', async () => {
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.find('[data-testid="summary-variant-title"]').text()).toBe('Red / XL')
  })

  it('sends variant_id per cart line (undefined for variantless lines)', async () => {
    mutateAsync.mockResolvedValue({
      id: 1,
      order_number: 'ORD-1',
      status: 'pending',
      currency: 'USD',
      total: 20,
      items: [],
    })
    const wrapper = await mountPage()
    await tick()

    // Pick a shipping method (enables submit), then submit the shipping form.
    const selector = wrapper.findComponent(StubSelector)
    selector.vm.$emit('update:modelValue', 5)
    await tick()
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St',
      city: 'Warsaw',
      postalCode: '00-001',
      country: 'PL',
    })
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync.mock.calls[0]![0].items).toEqual([
      { product_id: 10, variant_id: 7, quantity: 1 },
      { product_id: 11, variant_id: undefined, quantity: 2 },
    ])
  })
})

describe('checkout — discounts (automatic + free shipping)', () => {
  // USD subtotal of the stubbed cart: 10×1 + 5×2 = $20.
  async function mountWithShipping(amount = 10) {
    const wrapper = await mountPage()
    await tick()
    const selector = wrapper.findComponent(StubSelector)
    selector.vm.$emit('update:modelValue', 5)
    selector.vm.$emit('update:methodAmount', amount)
    await tick()
    return wrapper
  }

  it('threads the resolved shipping amount into the coupon field', async () => {
    const wrapper = await mountWithShipping(12.5)
    expect(wrapper.findComponent(StubCoupon).props('shippingAmount')).toBe(12.5)
  })

  it('free_shipping: strikes shipping through to 0, no goods-discount line, total excludes shipping', async () => {
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubCoupon).vm.$emit('update:modelValue', {
      code: 'FREESHIP',
      discountAmount: 10,
      freeShipping: true,
      isAutomatic: true,
    })
    await tick()

    const shippingFree = wrapper.find('[data-testid="summary-shipping-free"]')
    expect(shippingFree.exists()).toBe(true)
    expect(shippingFree.text()).toContain('$10.00')
    expect(shippingFree.text()).toContain('$0.00')
    // No goods-discount line — the saving shows as the zeroed shipping.
    expect(wrapper.find('[data-testid="summary-discount"]').exists()).toBe(false)
    // Total = 20 − 0 + 0.
    expect(wrapper.find('[data-testid="summary-total"]').text()).toBe('$20.00')
  })

  it('automatic goods discount: shows the discount line and total math', async () => {
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubCoupon).vm.$emit('update:modelValue', {
      code: 'AUTO15',
      discountAmount: 3,
      freeShipping: false,
      isAutomatic: true,
    })
    await tick()

    const discount = wrapper.find('[data-testid="summary-discount"]')
    expect(discount.exists()).toBe(true)
    expect(discount.text()).toContain('AUTO15')
    expect(wrapper.find('[data-testid="summary-shipping-free"]').exists()).toBe(false)
    // Total = 20 − 3 + 10.
    expect(wrapper.find('[data-testid="summary-total"]').text()).toBe('$27.00')
  })

  it('omits coupon_code from the order payload for an automatic discount', async () => {
    mutateAsync.mockResolvedValue({
      id: 3, order_number: 'ORD-3', status: 'pending', currency: 'USD', total: 17, items: [],
    })
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubCoupon).vm.$emit('update:modelValue', {
      code: 'AUTO15',
      discountAmount: 3,
      freeShipping: false,
      isAutomatic: true,
    })
    await tick()

    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St', city: 'Warsaw', postalCode: '00-001', country: 'PL',
    })
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync.mock.calls[0]![0].coupon_code).toBeUndefined()
  })

  it('sends coupon_code on the order payload for a manually-entered code', async () => {
    mutateAsync.mockResolvedValue({
      id: 4, order_number: 'ORD-4', status: 'pending', currency: 'USD', total: 25, items: [],
    })
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubCoupon).vm.$emit('update:modelValue', {
      code: 'SAVE5',
      discountAmount: 5,
      freeShipping: false,
      isAutomatic: false,
    })
    await tick()

    // Manual discount renders on the summary + flows into the total.
    expect(wrapper.find('[data-testid="summary-discount"]').text()).toContain('SAVE5')
    expect(wrapper.find('[data-testid="summary-total"]').text()).toBe('$25.00')

    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St', city: 'Warsaw', postalCode: '00-001', country: 'PL',
    })
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync.mock.calls[0]![0].coupon_code).toBe('SAVE5')
  })
})

describe('checkout — stored-value tenders (gift card + store credit)', () => {
  // USD subtotal of the stubbed cart: 10×1 + 5×2 = $20.
  async function mountWithShipping(amount = 10) {
    const wrapper = await mountPage()
    await tick()
    const selector = wrapper.findComponent(StubSelector)
    selector.vm.$emit('update:modelValue', 5)
    selector.vm.$emit('update:methodAmount', amount)
    await tick()
    return wrapper
  }

  it('threads the order total into the gift-card field and the remaining into store credit', async () => {
    const wrapper = await mountWithShipping(10)
    // orderTotal = subtotal 20 + shipping 10 = 30; no gift card → remaining 30.
    expect(wrapper.findComponent(StubGiftCard).props('orderTotal')).toBe(30)
    expect(wrapper.findComponent(StubStoreCredit).props('remaining')).toBe(30)
  })

  it('shows the gift-card + amount-due summary lines and passes remaining after the card', async () => {
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubGiftCard).vm.$emit('update:modelValue', {
      code: 'ABCD1234EFGH5678', last4: '5678', balance: 12, currency: 'USD',
    })
    await tick()

    // Coverage = min(12, 30) = 12; amount due = 30 − 12 = 18.
    expect(wrapper.find('[data-testid="summary-gift-card"]').text()).toContain('$12.00')
    expect(wrapper.find('[data-testid="summary-amount-due-value"]').text()).toBe('$18.00')
    // Store credit now applies to the remaining $18.
    expect(wrapper.findComponent(StubStoreCredit).props('remaining')).toBe(18)
  })

  it('shows the store-credit summary line off the applied-amount emit', async () => {
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubStoreCredit).vm.$emit('update:applied', 8)
    await tick()

    expect(wrapper.find('[data-testid="summary-store-credit"]').text()).toContain('$8.00')
    // Amount due = 30 − 8 = 22.
    expect(wrapper.find('[data-testid="summary-amount-due-value"]').text()).toBe('$22.00')
  })

  it('sends gift_card_code + use_store_credit on the order payload', async () => {
    mutateAsync.mockResolvedValue({
      id: 9, order_number: 'ORD-9', status: 'pending', currency: 'USD',
      total: 30, amount_due: 10, items: [],
    })
    const wrapper = await mountWithShipping(10)
    wrapper.findComponent(StubGiftCard).vm.$emit('update:modelValue', {
      code: 'ABCD1234EFGH5678', last4: '5678', balance: 12, currency: 'USD',
    })
    wrapper.findComponent(StubStoreCredit).vm.$emit('update:modelValue', true)
    await tick()

    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St', city: 'Warsaw', postalCode: '00-001', country: 'PL',
    })
    await tick()

    const payload = mutateAsync.mock.calls[0]![0]
    expect(payload.gift_card_code).toBe('ABCD1234EFGH5678')
    expect(payload.use_store_credit).toBe(true)
  })

  it('omits gift_card_code and sends use_store_credit=false when no tender is applied', async () => {
    mutateAsync.mockResolvedValue({
      id: 10, order_number: 'ORD-10', status: 'pending', currency: 'USD',
      total: 30, amount_due: 30, items: [],
    })
    const wrapper = await mountWithShipping(10)
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St', city: 'Warsaw', postalCode: '00-001', country: 'PL',
    })
    await tick()

    const payload = mutateAsync.mock.calls[0]![0]
    expect('gift_card_code' in payload).toBe(false)
    expect(payload.use_store_credit).toBe(false)
  })
})

describe('checkout — guest checkout', () => {
  it('is not gated behind the user middleware anymore', () => {
    // `import.meta.url` is not a file: URL in the Nuxt test env — resolve from
    // the project root (vitest cwd) instead.
    const src = readFileSync(resolve(process.cwd(), 'app/pages/checkout/index.vue'), 'utf8')
    expect(src).not.toMatch(/middleware:\s*['"]user['"]/)
  })

  it('shows the guest email field + sign-in hint when unauthenticated', async () => {
    authState.isAuthenticated = false
    addressesData.value = []
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.find('[data-testid="guest-email"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="guest-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="guest-hint"]').text()).toContain('sign in')
  })

  it('hides the guest email field for authenticated customers', async () => {
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.find('[data-testid="guest-email"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="guest-hint"]').exists()).toBe(false)
  })

  it('sends guest_email + locale on the create-order payload when anonymous', async () => {
    authState.isAuthenticated = false
    addressesData.value = []
    mutateAsync.mockResolvedValue({
      id: 2,
      order_number: 'ORD-2',
      status: 'pending',
      currency: 'USD',
      total: 20,
      guest_token: 'tok-abc',
      items: [],
    })
    const wrapper = await mountPage()
    await tick()

    const selector = wrapper.findComponent(StubSelector)
    selector.vm.$emit('update:modelValue', 5)
    await tick()
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      email: 'guest@example.com',
      address: '1 Main St',
      city: 'Warsaw',
      postalCode: '00-001',
      country: 'PL',
    })
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const payload = mutateAsync.mock.calls[0]![0]
    expect(payload.guest_email).toBe('guest@example.com')
    expect(payload.locale).toBe('en')
  })

  it('never sends guest_email when authenticated (backend 422s on it)', async () => {
    mutateAsync.mockResolvedValue({
      id: 1,
      order_number: 'ORD-1',
      status: 'pending',
      currency: 'USD',
      total: 20,
      items: [],
    })
    const wrapper = await mountPage()
    await tick()

    const selector = wrapper.findComponent(StubSelector)
    selector.vm.$emit('update:modelValue', 5)
    await tick()
    const form = wrapper.findComponent({ name: 'CheckoutShippingForm' })
    form.vm.$emit('submit', {
      address: '1 Main St',
      city: 'Warsaw',
      postalCode: '00-001',
      country: 'PL',
    })
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const payload = mutateAsync.mock.calls[0]![0]
    expect('guest_email' in payload).toBe(false)
    expect('locale' in payload).toBe(false)
  })
})

describe('checkout — all-gift-card (digital) order', () => {
  it('skips the shipping flow and renders the gift-card checkout block', async () => {
    cartState.items = [...GIFT_LINES]
    const wrapper = await mountPage()
    await tick()
    // No shipping form / method selector for a digital order.
    expect(wrapper.findComponent({ name: 'CheckoutShippingForm' }).exists()).toBe(false)
    expect(wrapper.find('[data-testid="gift-card-checkout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gift-card-place-order"]').exists()).toBe(true)
  })

  it('omits shipping_* and carries per-line gift fields on the payload (authed)', async () => {
    cartState.items = [...GIFT_LINES]
    mutateAsync.mockResolvedValue({
      id: 30, order_number: 'ORD-30', status: 'pending', currency: 'USD',
      total: 50, amount_due: 50, items: [],
    })
    const wrapper = await mountPage()
    await tick()

    await wrapper.find('[data-testid="gift-card-place-order"]').trigger('click')
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const payload = mutateAsync.mock.calls[0]![0]
    expect('shipping_method_id' in payload).toBe(false)
    expect('shipping_address' in payload).toBe(false)
    expect('shipping_country' in payload).toBe(false)
    expect(payload.items).toEqual([
      {
        product_id: 20,
        variant_id: 50,
        quantity: 1,
        gift_card_recipient_email: 'friend@example.com',
        gift_card_message: 'Enjoy!',
      },
    ])
  })

  it('requires a valid guest email before placing an all-gift-card order', async () => {
    authState.isAuthenticated = false
    addressesData.value = []
    cartState.items = [...GIFT_LINES]
    mutateAsync.mockResolvedValue({
      id: 31, order_number: 'ORD-31', status: 'pending', currency: 'USD',
      total: 50, amount_due: 50, guest_token: 'tok-gc', items: [],
    })
    const wrapper = await mountPage()
    await tick()

    // The dedicated gift-card guest-email field is shown (not the shipping form's).
    const emailInput = wrapper.find('[data-testid="gift-card-checkout"] input[type="email"]')
    expect(emailInput.exists()).toBe(true)
    // Empty email → the place-order button is disabled.
    expect(wrapper.find('[data-testid="gift-card-place-order"]').attributes('disabled')).toBeDefined()

    await emailInput.setValue('guest@example.com')
    await tick()
    expect(wrapper.find('[data-testid="gift-card-place-order"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-testid="gift-card-place-order"]').trigger('click')
    await tick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const payload = mutateAsync.mock.calls[0]![0]
    expect(payload.guest_email).toBe('guest@example.com')
    expect(payload.locale).toBe('en')
    expect('shipping_method_id' in payload).toBe(false)
  })
})
