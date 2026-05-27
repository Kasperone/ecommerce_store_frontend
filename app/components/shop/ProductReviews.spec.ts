// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductReviews from './ProductReviews.vue'

/**
 * `useProductReviews` (SSR public list), `useMyReview` (authed own review), and
 * `useReviewVotes` (authed helpful votes) are stubbed so we assert the
 * component's own rendering: summary + approved list, the guest login prompt,
 * the authed write button, the helpful-vote button (count, optimistic toggle,
 * pressed-state hydration, self-review guard), the sort control, the empty
 * state, and a11y. Endpoint mapping is pinned in `useMyReview.spec.ts` /
 * `useReviewVotes.spec.ts`; validation in `shared/validators/review.spec.ts`.
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
  helpful_count: 3,
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
  fetchMyVotes: vi.fn(),
  vote: vi.fn(),
  unvote: vi.fn(),
  toastAdd: vi.fn(),
  auth: { isAuthenticated: false },
}))

mockNuxtImport('useProductReviews', () => () => ({ data: state.data, refresh: state.refresh }))
mockNuxtImport('useMyReview', () => () => ({
  fetchMine: state.fetchMine,
  create: state.create,
  update: state.update,
  remove: state.remove,
}))
mockNuxtImport('useReviewVotes', () => () => ({
  fetchMyVotes: state.fetchMyVotes,
  vote: state.vote,
  unvote: state.unvote,
}))
mockNuxtImport('useToast', () => () => ({ add: state.toastAdd }))
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
      { ...SAMPLE_ITEM, id: 2, rating: 4, title: 'Good', author_name: 'Bob K.', is_verified_purchase: false, helpful_count: 1 },
    ],
    total: 2,
  }
  state.auth.isAuthenticated = false
  state.refresh.mockReset()
  state.fetchMine.mockReset().mockResolvedValue(null) // default: no own review (200 + null)
  state.create.mockReset()
  state.update.mockReset()
  state.remove.mockReset()
  state.fetchMyVotes.mockReset().mockResolvedValue(new Set())
  state.vote.mockReset()
  state.unvote.mockReset()
  state.toastAdd.mockReset()
})

const flush = () => new Promise(r => setTimeout(r, 0))
// Authed-user toggle buttons render as <button>; the guest variant is an <a>.
const helpfulButtons = (wrapper: Awaited<ReturnType<typeof mountSuspended>>) =>
  wrapper.findAll('button').filter((b: { text: () => string }) => b.text().includes('Helpful'))

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
    expect(state.fetchMyVotes).not.toHaveBeenCalled()
  })

  it('shows a write button for an authed user with no review yet', async () => {
    state.auth.isAuthenticated = true
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush()
    expect(state.fetchMine).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Write a review')
  })

  it('renders a store response under a review that has one', async () => {
    state.data.value = {
      summary: { average_rating: 5, total: 1, breakdown: { 5: 1 } },
      items: [{ ...SAMPLE_ITEM, admin_response: 'Thanks for the kind words!' }],
      total: 1,
    }
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    const text = wrapper.text()
    expect(text).toContain('Store response')
    expect(text).toContain('Thanks for the kind words!')
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

  // --- helpful votes ---

  it('shows the helpful count on each review', async () => {
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(wrapper.text()).toContain('Helpful (3)')
    expect(wrapper.text()).toContain('Helpful (1)')
  })

  it('shows the sort control when there is more than one review', async () => {
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(wrapper.find('[aria-label="Sort reviews"]').exists()).toBe(true)
  })

  it('hides the sort control with a single review', async () => {
    state.data.value = {
      summary: { average_rating: 5, total: 1, breakdown: { 5: 1 } },
      items: [SAMPLE_ITEM],
      total: 1,
    }
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(wrapper.find('[aria-label="Sort reviews"]').exists()).toBe(false)
  })

  it('marks a review helpful: optimistic bump + PUT, reconciled from the response', async () => {
    state.auth.isAuthenticated = true
    state.vote.mockResolvedValue({ review_id: 1, helpful_count: 4, my_vote: true })
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush() // onMounted fetchMine + fetchMyVotes

    await helpfulButtons(wrapper)[0]!.trigger('click')
    await flush()
    await wrapper.vm.$nextTick()

    expect(state.vote).toHaveBeenCalledWith(1, 1)
    expect(wrapper.text()).toContain('Helpful (4)')
  })

  it('hydrates the pressed state from my-votes', async () => {
    state.auth.isAuthenticated = true
    state.fetchMyVotes.mockResolvedValue(new Set([1]))
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush()
    await wrapper.vm.$nextTick()
    expect(helpfulButtons(wrapper)[0]!.attributes('aria-pressed')).toBe('true')
  })

  it('rolls back and toasts when a vote fails', async () => {
    state.auth.isAuthenticated = true
    state.vote.mockRejectedValue(new Error('network'))
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush()

    await helpfulButtons(wrapper)[0]!.trigger('click')
    await flush()
    await wrapper.vm.$nextTick()

    expect(state.toastAdd).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Helpful (3)') // rolled back to the original count
  })

  it('shows a plain count (no vote button) on the user\'s own review', async () => {
    state.auth.isAuthenticated = true
    state.fetchMine.mockResolvedValue({ ...SAMPLE_ITEM }) // own review is id 1
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    await flush()
    await wrapper.vm.$nextTick()
    // Only review 2 (someone else's) keeps a toggle button; review 1 is the caller's own.
    expect(helpfulButtons(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('found this helpful')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductReviews, { props: { productId: 1 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
