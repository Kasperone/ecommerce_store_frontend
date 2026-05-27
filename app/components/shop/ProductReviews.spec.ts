// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductReviews from './ProductReviews.vue'

/**
 * `useProductReviews` (SSR public list) and `useMyReview` (authed own review)
 * are stubbed so we assert the component's own rendering: summary + approved
 * list, the guest login prompt, the authed write button, the empty state, a11y.
 * Endpoint mapping is pinned in `useMyReview.spec.ts`; validation in
 * `shared/validators/review.spec.ts`.
 *
 * `region` is disabled in axe runs (an isolated component has no page landmark).
 */

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const SAMPLE_ITEM = {
  id: 1,
  product_id: 1,
  user_id: 2,
  rating: 5,
  title: 'Great phone',
  body: 'Loved using it every day.',
  status: 'approved',
  is_verified_purchase: true,
  author_name: 'Ann S.',
  created_at: '2026-05-27T10:00:00Z',
  updated_at: '2026-05-27T10:00:00Z',
}

const state = vi.hoisted(() => ({
  data: { value: null as unknown },
  refresh: vi.fn(),
  fetchMine: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  auth: { isAuthenticated: false },
}))

mockNuxtImport('useProductReviews', () => () => ({ data: state.data, refresh: state.refresh }))
mockNuxtImport('useMyReview', () => () => ({
  fetchMine: state.fetchMine,
  create: state.create,
  update: state.update,
  remove: state.remove,
}))
mockNuxtImport('useAuthStore', () => () => state.auth)

beforeEach(() => {
  state.data.value = {
    summary: {
      average_rating: 4.5,
      total: 2,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
    },
    items: [
      SAMPLE_ITEM,
      { ...SAMPLE_ITEM, id: 2, rating: 4, title: 'Good', author_name: 'Bob K.', is_verified_purchase: false },
    ],
    total: 2,
  }
  state.auth.isAuthenticated = false
  state.refresh.mockReset()
  state.fetchMine.mockReset().mockRejectedValue({}) // default: no own review (404)
  state.create.mockReset()
  state.update.mockReset()
  state.remove.mockReset()
})

const flush = () => new Promise(r => setTimeout(r, 0))

describe('ShopProductReviews', () => {
  it('renders the summary and approved reviews', async () => {
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    const text = wrapper.text()
    expect(text).toContain('Customer reviews')
    expect(text).toContain('4.5')
    expect(text).toContain('Great phone')
    expect(text).toContain('Ann S.')
  })

  it('prompts a guest to log in', async () => {
    state.auth.isAuthenticated = false
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(wrapper.text()).toContain('Log in to write a review')
    expect(state.fetchMine).not.toHaveBeenCalled()
  })

  it('shows a write button for an authed user with no review yet', async () => {
    state.auth.isAuthenticated = true
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush()
    expect(state.fetchMine).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Write a review')
  })

  it('renders an empty state when there are no approved reviews', async () => {
    state.data.value = {
      summary: { average_rating: 0, total: 0, breakdown: {} },
      items: [],
      total: 0,
    }
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(wrapper.text()).toContain('No reviews yet')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
