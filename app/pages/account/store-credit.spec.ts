// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Customer store-credit page: per-currency balances + ledger, with a graceful
 * empty state. `useMyStoreCreditQuery` is mocked at its boundary; the summary
 * shape mirrors `StoreCreditSummaryResponse`.
 */

const summaryData = ref<Record<string, unknown> | null>(null)
const statusRef = ref('success')

mockNuxtImport('useMyStoreCreditQuery', () => () => ({ data: summaryData, status: statusRef }))

const PassThrough = defineComponent({ setup: (_p, { slots }) => () => h('div', slots.default?.()) })

async function mountPage() {
  const Page = (await import('./store-credit.vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThrough, ClientOnly: PassThrough } },
  })
}

beforeEach(() => {
  summaryData.value = null
  statusRef.value = 'success'
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('account store-credit page', () => {
  it('shows the empty state when the customer has no store credit', async () => {
    summaryData.value = { accounts: [], entries: [] }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="store-credit-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="store-credit-balances"]').exists()).toBe(false)
  })

  it('renders per-currency balances', async () => {
    summaryData.value = {
      accounts: [{ currency: 'USD', balance: 40 }, { currency: 'PLN', balance: 150 }],
      entries: [],
    }
    const wrapper = await mountPage()
    const balances = wrapper.find('[data-testid="store-credit-balances"]')
    expect(balances.exists()).toBe(true)
    expect(balances.text()).toContain('$40.00')
    expect(balances.text()).toContain('150')
  })

  it('renders the ledger with signed amounts and an order link', async () => {
    summaryData.value = {
      accounts: [{ currency: 'USD', balance: 15 }],
      entries: [
        {
          id: 2, currency: 'USD', amount: -25, kind: 'redeem', balance_after: 15,
          order_id: 42, refund_id: null, note: null, created_at: '2026-07-10T10:00:00Z',
        },
        {
          id: 1, currency: 'USD', amount: 40, kind: 'adjust', balance_after: 40,
          order_id: null, refund_id: null, note: 'welcome', created_at: '2026-07-09T10:00:00Z',
        },
      ],
    }
    const wrapper = await mountPage()
    const rows = wrapper.findAll('[data-testid="store-credit-entry"]')
    expect(rows).toHaveLength(2)
    // Redeem: negative signed amount + a link to the order.
    expect(rows[0]!.text()).toContain('−$25.00')
    expect(rows[0]!.text()).toContain('#42')
    expect(rows[0]!.html()).toContain('/account/orders/42')
    // Adjust: positive signed amount, no order link.
    expect(rows[1]!.text()).toContain('+$40.00')
  })
})
