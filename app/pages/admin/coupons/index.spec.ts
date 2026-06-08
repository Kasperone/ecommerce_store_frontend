// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The coupons list page renders the paginated rows (code, discount, usage,
 * status) with the per-type discount cell and the "Auto" badge for automatic
 * coupons. We stub the list/delete queries and the Nuxt UI table (mirrors the
 * quotes list spec). The form modal's payload contract is pinned in
 * `CouponFormModal.spec.ts`.
 */

const ROWS = {
  items: [
    {
      id: 1,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      code: 'SAVE10',
      description: null,
      discount_type: 'percent',
      value: 10,
      currency: null,
      min_order_amount: null,
      max_uses: null,
      per_user_limit: null,
      used_count: 4,
      starts_at: null,
      ends_at: null,
      is_automatic: false,
      is_active: true,
    },
    {
      id: 2,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      code: 'FREESHIP',
      description: null,
      discount_type: 'free_shipping',
      value: 0,
      currency: null,
      min_order_amount: 50,
      max_uses: null,
      per_user_limit: null,
      used_count: 0,
      starts_at: null,
      ends_at: null,
      is_automatic: true,
      is_active: true,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)

vi.mock('~/composables/queries/useCouponQueries', () => ({
  useCouponsQuery: () => ({ data: listData, error: listError }),
  useDeleteCoupon: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

// Minimal UTable stub that renders each row's slotted cells.
const TableStub = defineComponent({
  name: 'UTable',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('table', {}, (props.data as Record<string, unknown>[]).map(row =>
      h('tr', { key: row.id as number }, [
        h('td', {}, slots['code-cell']?.({ row: { original: row } })),
        h('td', {}, slots['discount-cell']?.({ row: { original: row } })),
        h('td', {}, slots['used_count-cell']?.({ row: { original: row } })),
        h('td', {}, slots['is_active-cell']?.({ row: { original: row } })),
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
        UTable: TableStub,
        UFormField: PassThroughStub,
        UBadge: PassThroughStub,
        USelect: true,
        UInput: true,
        UPagination: true,
        AdminCouponFormModal: true,
        AdminCouponDeleteConfirm: true,
        ErrorAlert: true,
      },
    },
  })
}

describe('admin/coupons list page', () => {
  it('renders each coupon row with its code and discount-type label', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('SAVE10')
    expect(wrapper.text()).toContain('10%')
    expect(wrapper.text()).toContain('Percentage')
    expect(wrapper.text()).toContain('FREESHIP')
    expect(wrapper.text()).toContain('Free shipping')
  })

  it('shows the Auto badge only for automatic coupons', async () => {
    const wrapper = await mountPage()
    const badges = wrapper.findAll('[data-testid="coupon-auto-badge"]')
    expect(badges).toHaveLength(1)
    // The badge sits in the FREESHIP row, not the SAVE10 one.
    const rows = wrapper.findAll('tr')
    const freeshipRow = rows.find(r => r.text().includes('FREESHIP'))
    expect(freeshipRow?.find('[data-testid="coupon-auto-badge"]').exists()).toBe(true)
    const save10Row = rows.find(r => r.text().includes('SAVE10'))
    expect(save10Row?.find('[data-testid="coupon-auto-badge"]').exists()).toBe(false)
  })

  it('renders a dash (no value) in the discount cell for free_shipping coupons', async () => {
    const wrapper = await mountPage()
    const rows = wrapper.findAll('tr')
    const freeshipRow = rows.find(r => r.text().includes('FREESHIP'))
    expect(freeshipRow?.text()).toContain('—')
    expect(freeshipRow?.text()).not.toContain('0 ')
  })
})
