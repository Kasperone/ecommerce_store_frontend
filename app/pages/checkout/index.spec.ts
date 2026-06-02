// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { Address } from '~/composables/queries/useAddresses'

/**
 * Checkout shipping-address prefill from the saved address book.
 *
 * Scope of THIS spec: only the saved-address picker + shipping-form prefill
 * wiring added by the address-book feature. The cart store, currency preference,
 * create-order mutation and the shipping-method selector are stubbed/mocked at
 * their boundaries; the rest of checkout (coupon/payment/summary) is covered
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

vi.mock('~/composables/queries/useAddresses', () => ({
  useAddressesQuery: () => ({ data: addressesData, isLoading: ref(false) }),
}))

vi.mock('~/composables/queries/useOrderQueries', () => ({
  useCreateOrder: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
}))

// Cart with one item so the order grid (and the shipping form) renders.
mockNuxtImport('useCartStore', () => () => ({
  items: [{ productId: 10, name: 'Widget', quantity: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0, priceUsd: { amount: 1000, currency: 'USD' } }],
  isEmpty: false,
  clear: vi.fn(),
}))

mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: ref('USD'),
}))

mockNuxtImport('useAuthStore', () => () => ({
  user: null,
  isImpersonating: false,
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
