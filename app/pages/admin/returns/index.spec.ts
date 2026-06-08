// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The admin returns list page renders the paginated rows (order number,
 * customer email, status, unit count) and exposes the status filter. We stub
 * the list query and the Nuxt UI components (mirrors the quotes list spec).
 */

const ROWS = {
  items: [
    {
      id: 3,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      order_id: 7,
      user_id: 42,
      status: 'requested',
      comment: null,
      admin_note: null,
      refund_id: null,
      resolved_at: null,
      order_number: 'ORD-20260601-AAA111',
      currency: 'USD',
      customer_email: 'buyer@example.com',
      items: [
        { id: 91, return_request_id: 3, order_item_id: 11, quantity: 2, reason: 'defective', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
        { id: 92, return_request_id: 3, order_item_id: 12, quantity: 1, reason: 'other', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
      ],
    },
    {
      id: 4,
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
      order_id: 8,
      user_id: 43,
      status: 'refunded',
      comment: null,
      admin_note: null,
      refund_id: 5,
      resolved_at: '2026-06-03T00:00:00Z',
      order_number: 'ORD-20260602-BBB222',
      currency: 'PLN',
      customer_email: 'other@example.com',
      items: [],
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)

vi.mock('~/composables/queries/useReturnQueries', () => ({
  useAdminReturnsQuery: () => ({ data: listData, error: listError }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  props: { ariaLabel: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', {
      'aria-label': props.ariaLabel,
      'onClick': () => emit('click'),
    }, slots.default?.())
  },
})

// Minimal UTable stub that renders each row's slotted cells.
const TableStub = defineComponent({
  name: 'UTable',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('table', {}, (props.data as Record<string, unknown>[]).map(row =>
      h('tr', { key: row.id as number }, [
        h('td', {}, slots['id-cell']?.({ row: { original: row } })),
        h('td', {}, slots['order_number-cell']?.({ row: { original: row } })),
        h('td', {}, slots['customer_email-cell']?.({ row: { original: row } })),
        h('td', {}, slots['status-cell']?.({ row: { original: row } })),
        h('td', {}, slots['item_count-cell']?.({ row: { original: row } })),
        h('td', {}, slots['created_at-cell']?.({ row: { original: row } })),
        h('td', {}, slots['actions-cell']?.({ row: { original: row } })),
      ]),
    ))
  },
})

beforeEach(() => {
  listData.value = ROWS
  listError.value = null
  mockNavigate.mockClear()
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        UButton: ButtonStub,
        UTable: TableStub,
        UFormField: PassThroughStub,
        UBadge: PassThroughStub,
        ULink: PassThroughStub,
        USelect: true,
        UPagination: true,
      },
    },
  })
}

describe('admin/returns list page', () => {
  it('renders each return row (order + customer + status)', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('ORD-20260601-AAA111')
    expect(wrapper.text()).toContain('buyer@example.com')
    expect(wrapper.text()).toContain('other@example.com')
    // Status labels (English copy).
    expect(wrapper.text()).toContain('Requested')
    expect(wrapper.text()).toContain('Refunded')
  })

  it('sums the returned units per row', async () => {
    const wrapper = await mountPage()
    // First row: 2 + 1 = 3 units.
    expect(wrapper.text()).toContain('3')
  })

  it('shows the empty state when there are no returns', async () => {
    listData.value = { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No return requests yet')
  })

  it('renders the list error via ErrorAlert', async () => {
    listError.value = { data: { detail: 'Boom' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boom')
  })
})
