// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import OrderTimeline from './OrderTimeline.vue'

/**
 * The timeline card owns its events query + comment mutation. We stub those
 * auto-imports + the auth store's `can()` and assert: reverse-chron render with
 * per-kind labels, the comment box visibility gate (orders:write), and that a
 * comment submit calls the mutation with the trimmed text.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    events: [] as unknown[],
    addMutate: vi.fn(),
    can: vi.fn(() => true),
    toastAdd: vi.fn(),
  },
}))

mockNuxtImport('useOrderEventsQuery', () => () => ({
  data: ref(mocks.events),
  isLoading: ref(false),
  error: ref(null),
}))
mockNuxtImport('useAddOrderComment', () => () => ({
  mutateAsync: mocks.addMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useAuthStore', () => () => ({ can: mocks.can }))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

const EVENTS = [
  {
    id: 3,
    order_id: 1,
    kind: 'status_changed',
    comment: null,
    payload: { from: 'pending', to: 'paid' },
    actor: { id: 9, email: 'a@x.com', first_name: 'Ada', last_name: 'Admin' },
    created_at: '2026-07-15T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
  },
  {
    id: 2,
    order_id: 1,
    kind: 'note',
    comment: 'Called the customer',
    payload: {},
    actor: { id: 9, email: 'a@x.com', first_name: 'Ada', last_name: 'Admin' },
    created_at: '2026-07-15T09:30:00Z',
    updated_at: '2026-07-15T09:30:00Z',
  },
  {
    id: 1,
    order_id: 1,
    kind: 'created',
    comment: null,
    payload: {},
    actor: null,
    created_at: '2026-07-15T09:00:00Z',
    updated_at: '2026-07-15T09:00:00Z',
  },
]

beforeEach(() => {
  mocks.events = EVENTS
  mocks.addMutate.mockReset().mockResolvedValue({})
  mocks.can.mockReset().mockReturnValue(true)
  mocks.toastAdd.mockReset()
})

describe('OrderTimeline', () => {
  it('renders events with per-kind labels + actor (System for null actor)', async () => {
    const wrapper = await mountSuspended(OrderTimeline, { props: { orderId: 1 } })
    const text = wrapper.text()
    expect(text).toContain('Status changed from pending to paid')
    expect(text).toContain('Called the customer')
    expect(text).toContain('Order created')
    // Null-actor event attributes to System.
    expect(text).toContain('System')
    expect(text).toContain('Ada Admin')
  })

  it('shows the comment box when the staffer has orders:write', async () => {
    const wrapper = await mountSuspended(OrderTimeline, { props: { orderId: 1 } })
    expect(wrapper.find('[data-testid="order-comment-input"]').exists()).toBe(true)
  })

  it('hides the comment box without orders:write', async () => {
    mocks.can.mockReturnValue(false)
    const wrapper = await mountSuspended(OrderTimeline, { props: { orderId: 1 } })
    expect(wrapper.find('[data-testid="order-comment-input"]').exists()).toBe(false)
  })

  it('submits a trimmed comment via the mutation', async () => {
    const wrapper = await mountSuspended(OrderTimeline, { props: { orderId: 7 } })
    const input = wrapper.find('[data-testid="order-comment-input"]')
    await input.setValue('  hello world  ')
    await wrapper.find('[data-testid="order-comment-submit"]').trigger('click')
    expect(mocks.addMutate).toHaveBeenCalledWith({ orderId: 7, comment: 'hello world' })
  })

  it('renders the empty state when there are no events', async () => {
    mocks.events = []
    const wrapper = await mountSuspended(OrderTimeline, { props: { orderId: 1 } })
    expect(wrapper.text()).toContain('No timeline events yet.')
  })
})
