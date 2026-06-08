// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The segments list page renders the paginated rows (name, description, active
 * status), opens the create/edit modal, and deletes via the confirm dialog. We
 * stub the list/delete queries and the Nuxt UI table (mirrors the coupons list
 * spec). The form modal's filter-builder + preview contract is pinned in
 * `SegmentFormModal.spec.ts`.
 */

const ROWS = {
  items: [
    {
      id: 1,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      name: 'VIP buyers',
      description: 'High spenders',
      filters: { tag_match: 'any', min_order_count: 5 },
      is_active: true,
    },
    {
      id: 2,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      name: 'Lapsed',
      description: null,
      filters: { tag_match: 'any' },
      is_active: false,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)
const deleteMutate = vi.fn()

vi.mock('~/composables/queries/useSegmentQueries', () => ({
  useSegmentsQuery: () => ({ data: listData, error: listError }),
  useDeleteSegment: () => ({ mutateAsync: deleteMutate, isLoading: ref(false) }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const TableStub = defineComponent({
  name: 'UTable',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('table', {}, (props.data as Record<string, unknown>[]).map(row =>
      h('tr', { key: row.id as number }, [
        h('td', {}, slots['name-cell']?.({ row: { original: row } })),
        h('td', {}, slots['is_active-cell']?.({ row: { original: row } })),
        h('td', {}, slots['actions-cell']?.({ row: { original: row } })),
      ]),
    ))
  },
})

beforeEach(() => {
  listData.value = ROWS
  listError.value = null
  deleteMutate.mockReset().mockResolvedValue(undefined)
  mockNavigate.mockClear()
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        ClientOnly: PassThroughStub,
        UTable: TableStub,
        UFormField: PassThroughStub,
        UBadge: PassThroughStub,
        USelect: true,
        UInput: true,
        UPagination: true,
        AdminSegmentFormModal: true,
        AdminSegmentDeleteConfirm: true,
        ErrorAlert: true,
      },
    },
  })
}

describe('admin/segments list page', () => {
  it('renders each segment row with its name and description', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('VIP buyers')
    expect(wrapper.text()).toContain('High spenders')
    expect(wrapper.text()).toContain('Lapsed')
  })

  it('renders the Active / Inactive status per row', async () => {
    const wrapper = await mountPage()
    const rows = wrapper.findAll('tr')
    const vip = rows.find(r => r.text().includes('VIP buyers'))
    const lapsed = rows.find(r => r.text().includes('Lapsed'))
    expect(vip?.text()).toContain('Active')
    expect(lapsed?.text()).toContain('Inactive')
  })

  it('shows the empty state when there are no segments', async () => {
    listData.value = { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No segments yet.')
  })

  it('exposes a create action', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('New segment')
  })
})
