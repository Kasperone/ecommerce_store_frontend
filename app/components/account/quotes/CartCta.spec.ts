// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import CartCta from './CartCta.vue'

// Plain `vi.fn()` mocks are safe in `vi.hoisted` (no `import` reference). The
// reactive state lives in module-scope refs below — `mockNuxtImport`'s factory
// runs lazily after imports settle, so it can close over them (testing rule:
// the hoisted factory itself can't reference `ref`).
const { mockRequest, mockNavigate, mockToastAdd } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockToastAdd: vi.fn(),
}))

const isB2B = ref(true)
const cartItems = ref<Array<{ productId: number, quantity: number }>>([
  { productId: 11, quantity: 2 },
  { productId: 22, quantity: 1 },
])
const cartIsEmpty = ref(false)
const currency = ref('USD')

mockNuxtImport('useCompanyContext', () => () => ({
  company: ref(null),
  isB2B,
  isResolving: ref(false),
  error: ref(null),
}))

vi.mock('~/composables/queries/useQuotes', () => ({
  useRequestQuote: () => ({ mutateAsync: mockRequest }),
}))

mockNuxtImport('useCartStore', () => () => ({
  get items() { return cartItems.value },
  get isEmpty() { return cartIsEmpty.value },
}))

mockNuxtImport('useCurrencyPreference', () => () => ({ currency }))
mockNuxtImport('navigateTo', () => mockNavigate)
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('AccountQuotesCartCta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isB2B.value = true
    cartIsEmpty.value = false
    cartItems.value = [
      { productId: 11, quantity: 2 },
      { productId: 22, quantity: 1 },
    ]
    currency.value = 'USD'
    mockRequest.mockResolvedValue({ id: 42 })
  })

  it('renders the CTA for a B2B account', async () => {
    const wrapper = await mountSuspended(CartCta)
    expect(wrapper.find('[data-testid="request-quote-cta"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Request a quote')
  })

  it('hides the CTA for a non-B2B account', async () => {
    isB2B.value = false
    const wrapper = await mountSuspended(CartCta)
    expect(wrapper.find('[data-testid="request-quote-cta"]').exists()).toBe(false)
  })

  it('posts the cart lines and navigates to the new quote on click', async () => {
    const wrapper = await mountSuspended(CartCta)
    await wrapper.find('[data-testid="request-quote-cta"]').trigger('click')
    await flush()
    expect(mockRequest).toHaveBeenCalledWith({
      currency: 'USD',
      items: [
        { product_id: 11, quantity: 2 },
        { product_id: 22, quantity: 1 },
      ],
    })
    expect(mockNavigate).toHaveBeenCalledWith('/account/quotes/42')
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('toasts an error and does not navigate when the request fails', async () => {
    mockRequest.mockRejectedValue({ data: { detail: 'not_b2b' } })
    const wrapper = await mountSuspended(CartCta)
    await wrapper.find('[data-testid="request-quote-cta"]').trigger('click')
    await flush()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0][0].color).toBe('error')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('still toasts (does not throw) when the rejection carries no error (parseProblem returns null)', async () => {
    mockRequest.mockRejectedValue(null)
    const wrapper = await mountSuspended(CartCta)
    await wrapper.find('[data-testid="request-quote-cta"]').trigger('click')
    await flush()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
