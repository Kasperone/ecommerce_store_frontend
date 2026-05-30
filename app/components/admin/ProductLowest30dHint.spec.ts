// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ProductLowest30dHint from './ProductLowest30dHint.vue'

const { lowestData } = vi.hoisted(() => ({
  lowestData: { value: null as { lowest_price: number | null, since: string | null } | null },
}))

mockNuxtImport('useProductLowest30d', () => async () => ({ data: lowestData }))

beforeEach(() => {
  lowestData.value = null
})

describe('AdminProductLowest30dHint', () => {
  it('renders nothing when productId is omitted (create mode)', async () => {
    const wrapper = await mountSuspended(ProductLowest30dHint, {
      props: { currency: 'USD' },
    })
    expect(wrapper.find('[data-testid="admin-lowest30d-hint"]').exists()).toBe(false)
  })

  it('renders nothing when there is no history for the (product, currency)', async () => {
    lowestData.value = { lowest_price: null, since: null }
    const wrapper = await mountSuspended(ProductLowest30dHint, {
      props: { productId: 7, currency: 'USD' },
    })
    expect(wrapper.find('[data-testid="admin-lowest30d-hint"]').exists()).toBe(false)
  })

  it('renders the hint when history exists (even if equal to current)', async () => {
    // Admin variant: shows whenever a floor exists, regardless of D1's
    // "only when lowest < current" storefront rule — admins need to know the
    // floor before announcing a discount.
    lowestData.value = { lowest_price: 12.34, since: '2026-05-15T00:00:00' }
    const wrapper = await mountSuspended(ProductLowest30dHint, {
      props: { productId: 7, currency: 'USD' },
    })
    const hint = wrapper.find('[data-testid="admin-lowest30d-hint"]')
    expect(hint.exists()).toBe(true)
    // Text-content assertion deferred to the dev-server walkthrough;
    // see `OmnibusPrice.spec.ts` for the rationale.
  })

  it('renders for the PLN currency variant', async () => {
    lowestData.value = { lowest_price: 99.0, since: '2026-05-15T00:00:00' }
    const wrapper = await mountSuspended(ProductLowest30dHint, {
      props: { productId: 7, currency: 'PLN' },
    })
    expect(wrapper.find('[data-testid="admin-lowest30d-hint"]').exists()).toBe(true)
  })
})
