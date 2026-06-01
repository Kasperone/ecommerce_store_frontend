// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The quotes list page renders the paginated rows (company name, status, total)
 * and exposes the status/company filters + a "New quote" CTA. We stub the list
 * query, the companies query (filter dropdown), and the Nuxt UI components.
 */

const ROWS = {
  items: [
    {
      id: 9,
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
      company_id: 3,
      company_name: 'Acme Corp',
      status: 'sent',
      currency: 'USD',
      valid_until: '2026-12-31',
      subtotal: 250,
      total: 250,
      item_count: 1,
    },
    {
      id: 10,
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
      company_id: 5,
      company_name: 'Globex',
      status: 'draft',
      currency: 'PLN',
      valid_until: null,
      subtotal: 100,
      total: 100,
      item_count: 2,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)

vi.mock('~/composables/queries/useQuoteQueries', () => ({
  useQuotesQuery: () => ({ data: listData, error: listError }),
  useQuoteCompaniesQuery: () => ({ data: ref({ items: [] }), error: ref(null) }),
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
        h('td', {}, slots['company_name-cell']?.({ row: { original: row } })),
        h('td', {}, slots['status-cell']?.({ row: { original: row } })),
        h('td', {}, slots['item_count-cell']?.({ row: { original: row } })),
        h('td', {}, slots['valid_until-cell']?.({ row: { original: row } })),
        h('td', {}, slots['total-cell']?.({ row: { original: row } })),
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

describe('admin/quotes list page', () => {
  it('renders each quote row (company + status + total)', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Acme Corp')
    expect(wrapper.text()).toContain('Globex')
    // Status labels (English copy).
    expect(wrapper.text()).toContain('Sent')
    expect(wrapper.text()).toContain('Draft')
  })

  it('shows the empty state when there are no quotes', async () => {
    listData.value = { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No quotes yet')
  })

  it('navigates to the create page from the New quote CTA', async () => {
    const wrapper = await mountPage()
    const create = [...wrapper.findAll('button')].find(
      b => b.text().trim() === 'New quote',
    )
    expect(create).toBeTruthy()
    await create!.trigger('click')
    expect(mockNavigate).toHaveBeenCalledWith('/admin/quotes/new')
  })

  it('renders the list error via ErrorAlert', async () => {
    listError.value = { data: { detail: 'Boom' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boom')
  })
})
