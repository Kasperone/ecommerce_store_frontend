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

const { mutateAsync, mockNavigate, authState } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mockNavigate: vi.fn(),
  // Mutable auth stand-in: set `isAuthenticated` per test BEFORE mounting (the
  // page reads it at render — auth state is settled pre-mount in the real app).
  authState: { isAuthenticated: true },
}))

vi.mock('~/composables/queries/useAddresses', () => ({
  useAddressesQuery: () => ({ data: addressesData, isLoading: ref(false) }),
}))

vi.mock('~/composables/queries/useOrderQueries', () => ({
  useCreateOrder: () => ({ mutateAsync, isLoading: ref(false) }),
}))

mockNuxtImport('navigateTo', () => mockNavigate)

// Cart with one variant + one variantless line so the order grid (and the
// shipping form) renders and the payload test covers both line shapes.
mockNuxtImport('useCartStore', () => () => ({
  items: [
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
  ],
  isEmpty: false,
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
const StubCoupon = defineComponent({ setup: () => () => h('div', 'coupon') })

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
      },
    },
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  addressesData.value = ADDRESSES
  authState.isAuthenticated = true
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
