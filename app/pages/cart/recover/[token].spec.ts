// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Abandoned-cart recovery page (/cart/recover/[token]), public.
 *
 * The page fetches `GET /api/v1/carts/recover/{token}` on the client
 * (`onMounted` — the cart is client-only state), merges the recovered lines
 * into the cart store (additive, existing lines win — semantics pinned in
 * `app/stores/cart.spec.ts`) and redirects to /cart. Failures render states
 * keyed on the MACHINE `detail` codes (`cart_not_found`,
 * `recovery_link_expired`, `cart_already_ordered`), never on prose.
 *
 * `useApi`/`useCartStore`/`useToast` are stubbed at their boundaries; the
 * merge logic itself is covered by the store spec.
 */

const { apiFetch, mockNavigate, mergeRecovered, toastAdd, routeParams } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  mockNavigate: vi.fn(),
  mergeRecovered: vi.fn(),
  toastAdd: vi.fn(),
  routeParams: { token: 'tok-recover-abc' },
}))

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

mockNuxtImport('navigateTo', () => mockNavigate)
mockNuxtImport('useRoute', () => () => ({
  params: routeParams,
  query: {},
}))
mockNuxtImport('useCartStore', () => () => ({ mergeRecovered }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function recoveredItem(productId = 1, quantity = 2) {
  return {
    quantity,
    product: { id: productId, slug: `p-${productId}`, name: `Product ${productId}` },
    variant: null,
  }
}

async function mountPage() {
  const Page = (await import('./[token].vue')).default
  const wrapper = await mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
  // The fetch runs in onMounted — yield so the promise settles and re-renders.
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  apiFetch.mockReset()
  mockNavigate.mockClear()
  mergeRecovered.mockClear()
  toastAdd.mockClear()
})

describe('cart recovery page', () => {
  it('fetches the public recover endpoint with the token from the URL', async () => {
    apiFetch.mockResolvedValue({ items: [recoveredItem()] })
    await mountPage()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/carts/recover/tok-recover-abc')
  })

  it('merges the recovered lines into the cart, toasts, and redirects to /cart', async () => {
    const items = [recoveredItem(1), recoveredItem(2, 1)]
    apiFetch.mockResolvedValue({ items })
    await mountPage()

    expect(mergeRecovered).toHaveBeenCalledTimes(1)
    expect(mergeRecovered).toHaveBeenCalledWith(items)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your cart has been restored' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/cart')
  })

  it('shows the "no longer available" state on an empty recovered cart (no redirect)', async () => {
    apiFetch.mockResolvedValue({ items: [] })
    const wrapper = await mountPage()

    expect(mergeRecovered).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    const empty = wrapper.find('[data-testid="recover-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('The items from your cart are no longer available.')
    expect(empty.text()).toContain('Browse products')
  })

  it('renders the invalid-link state on 404 cart_not_found', async () => {
    apiFetch.mockRejectedValue({ data: { detail: 'cart_not_found' }, status: 404 })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="recover-error-message"]').text())
      .toContain('This recovery link isn\'t valid')
    expect(wrapper.find('[data-testid="recover-retry"]').exists()).toBe(false)
  })

  it('renders the expired state on 410 recovery_link_expired', async () => {
    apiFetch.mockRejectedValue({ data: { detail: 'recovery_link_expired' }, status: 410 })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="recover-error-message"]').text())
      .toContain('This recovery link has expired.')
  })

  it('renders the already-ordered state with an orders link on 410 cart_already_ordered', async () => {
    apiFetch.mockRejectedValue({ data: { detail: 'cart_already_ordered' }, status: 410 })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="recover-error-message"]').text())
      .toContain('already completed this order')
    const viewOrders = wrapper.find('[data-testid="recover-view-orders"]')
    expect(viewOrders.exists()).toBe(true)
    expect(viewOrders.attributes('href')).toBe('/account/orders')
  })

  it('renders the generic failure state with a retry button on unknown errors', async () => {
    // e.g. a 429 from the rate limiter — slowapi's detail is prose, not a code.
    apiFetch.mockRejectedValue({ data: { detail: 'Rate limit exceeded' }, status: 429 })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="recover-error-message"]').text())
      .toContain('We couldn\'t restore your cart.')
    expect(wrapper.find('[data-testid="recover-retry"]').exists()).toBe(true)
    expect(mergeRecovered).not.toHaveBeenCalled()
  })

  it('retries the fetch when the retry button is clicked', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network down'))
    const wrapper = await mountPage()
    expect(apiFetch).toHaveBeenCalledTimes(1)

    apiFetch.mockResolvedValue({ items: [recoveredItem()] })
    await wrapper.find('[data-testid="recover-retry"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(mergeRecovered).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/cart')
  })
})
