// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The gift-cards list page renders the paginated rows (masked code, balance /
 * initial, status + derived expired badge, expiry, recipient) and opens the
 * issue modal. We stub the list query and the Nuxt UI table (mirrors the
 * coupons list spec). The issue payload contract is pinned in
 * `GiftCardIssueModal.spec.ts`; URL/verb mapping in the query spec.
 */

const ROWS = {
  items: [
    {
      id: 1,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      last4: '7QK2',
      initial_value: 100,
      balance: 60,
      currency: 'PLN',
      status: 'active',
      expires_at: null,
      recipient_email: 'gift@example.com',
      user_id: null,
      note: null,
    },
    {
      id: 2,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      last4: 'ZZ99',
      initial_value: 50,
      balance: 50,
      currency: 'USD',
      status: 'active',
      // Long past — the derived "Expired" badge must show despite status=active.
      expires_at: '2020-01-01T00:00:00Z',
      recipient_email: null,
      user_id: null,
      note: null,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)

vi.mock('~/composables/queries/useGiftCardQueries', () => ({
  useGiftCardsQuery: () => ({ data: listData, error: listError }),
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
        h('td', {}, slots['last4-cell']?.({ row: { original: row } })),
        h('td', {}, slots['balance-cell']?.({ row: { original: row } })),
        h('td', {}, slots['status-cell']?.({ row: { original: row } })),
        h('td', {}, slots['expires_at-cell']?.({ row: { original: row } })),
        h('td', {}, slots['recipient_email-cell']?.({ row: { original: row } })),
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
        AdminGiftCardIssueModal: true,
        ErrorAlert: true,
      },
    },
  })
}

describe('admin/gift-cards list page', () => {
  it('renders each card row with its masked code, balance and recipient', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('•••• 7QK2')
    expect(text).toContain('•••• ZZ99')
    expect(text).toContain('gift@example.com')
    // balance / initial_value pair on the PLN row.
    const rows = wrapper.findAll('tr')
    const plnRow = rows.find(r => r.text().includes('7QK2'))!
    expect(plnRow.text()).toContain('60')
    expect(plnRow.text()).toContain('100')
  })

  it('shows the derived Expired badge only for cards past their expiry', async () => {
    const wrapper = await mountPage()
    const rows = wrapper.findAll('tr')
    const expiredRow = rows.find(r => r.text().includes('ZZ99'))
    expect(expiredRow?.find('[data-testid="gift-card-expired-badge"]').exists()).toBe(true)
    const liveRow = rows.find(r => r.text().includes('7QK2'))
    expect(liveRow?.find('[data-testid="gift-card-expired-badge"]').exists()).toBe(false)
  })

  it('shows the no-cards empty state when the list is empty and unfiltered', async () => {
    listData.value = { ...ROWS, items: [], total: 0 }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No gift cards yet.')
  })

  it('opens the issue modal from the header button', async () => {
    const wrapper = await mountPage()
    expect((wrapper.vm as any).issueOpen).toBe(false)
    await wrapper.find('[data-testid="gift-card-issue-button"]').trigger('click')
    expect((wrapper.vm as any).issueOpen).toBe(true)
  })
})
