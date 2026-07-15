// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CustomerStoreCredit from './CustomerStoreCredit.vue'

/**
 * The store-credit panel owns its summary query + the signed adjust mutation
 * and the success toast, so we stub those auto-imports and assert the panel's
 * rendering (per-currency balances + ledger), the adjust payload, and the
 * `store_credit_balance_negative` machine-code mapping. URL/verb mapping is
 * pinned in useStoreCreditQueries.spec.ts.
 */

// `region` is a page-level landmark rule — N/A to an isolated card (it sits
// inside the page's <main> in production). Disabled like the other card specs.
const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'region': { enabled: false },
  },
}

const mocks = vi.hoisted(() => ({
  summary: { accounts: [], entries: [] } as unknown,
  adjustMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCustomerStoreCreditQuery', () => () => ({
  data: ref(mocks.summary),
  isLoading: ref(false),
  error: ref(null),
}))
mockNuxtImport('useAdjustCustomerStoreCredit', () => () => ({
  mutateAsync: mocks.adjustMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))
// The signed-adjust form is gated on the orders:refund capability — grant it so
// the panel renders the form. Capability gating itself is tested in auth.spec.ts.
mockNuxtImport('useAuthStore', () => () => ({ can: () => true, isOwner: true }))

const SUMMARY = {
  accounts: [
    { currency: 'PLN', balance: 120 },
    { currency: 'USD', balance: 15.5 },
  ],
  entries: [
    {
      id: 21,
      currency: 'PLN',
      amount: -30,
      kind: 'redeem',
      balance_after: 120,
      order_id: 9,
      refund_id: null,
      note: null,
      created_at: '2026-07-10T00:00:00Z',
    },
    {
      id: 20,
      currency: 'PLN',
      amount: 150,
      kind: 'adjust',
      balance_after: 150,
      order_id: null,
      refund_id: null,
      note: 'goodwill grant',
      created_at: '2026-07-09T00:00:00Z',
    },
  ],
}

beforeEach(() => {
  mocks.summary = { accounts: [], entries: [] }
  mocks.adjustMutate.mockReset().mockResolvedValue(SUMMARY)
  mocks.toastAdd.mockReset()
  document.body.innerHTML = ''
})

const tick = () => new Promise(r => setTimeout(r, 0))

describe('CustomerStoreCredit (AdminCustomerStoreCredit)', () => {
  it('shows the empty states when the customer has no credit', async () => {
    const wrapper = await mountSuspended(CustomerStoreCredit, { props: { customerId: 1 } })
    expect(wrapper.text()).toContain('No store credit yet.')
    expect(wrapper.text()).toContain('No movements yet.')
  })

  it('renders per-currency balances and the ledger with kind labels', async () => {
    mocks.summary = SUMMARY
    const wrapper = await mountSuspended(CustomerStoreCredit, { props: { customerId: 1 } })
    expect(wrapper.find('[data-testid="store-credit-balance-PLN"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="store-credit-balance-USD"]').exists()).toBe(true)
    const text = wrapper.text()
    expect(text).toContain('Redemption')
    expect(text).toContain('Adjustment')
    expect(text).toContain('goodwill grant')
  })

  it('is axe-clean', async () => {
    mocks.summary = SUMMARY
    const wrapper = await mountSuspended(CustomerStoreCredit, { props: { customerId: 1 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('POSTs the signed adjust with currency and trimmed note, then toasts', async () => {
    const wrapper = await mountSuspended(CustomerStoreCredit, { props: { customerId: 3 } })
    const amount = wrapper.findAllComponents({ name: 'UInputNumber' })[0]
    amount!.vm.$emit('update:modelValue', -25)
    // Nuxt UI forwards attrs onto the native input, so the testid IS the input.
    await wrapper.find('[data-testid="store-credit-adjust-note"]').setValue('  claw-back  ')
    await tick()

    await wrapper.find('[data-testid="store-credit-adjust-submit"]').trigger('click')
    await tick()

    expect(mocks.adjustMutate).toHaveBeenCalledWith({
      customerId: 3,
      body: { amount: -25, currency: 'USD', note: 'claw-back' },
    })
    expect(mocks.toastAdd).toHaveBeenCalled()
  })

  it('maps the store_credit_balance_negative machine code to readable copy', async () => {
    mocks.adjustMutate.mockRejectedValueOnce({
      status: 400,
      data: { detail: 'store_credit_balance_negative' },
    })
    const wrapper = await mountSuspended(CustomerStoreCredit, { props: { customerId: 3 } })
    const amount = wrapper.findAllComponents({ name: 'UInputNumber' })[0]
    amount!.vm.$emit('update:modelValue', -999)
    await tick()

    await wrapper.find('[data-testid="store-credit-adjust-submit"]').trigger('click')
    await tick()

    expect(wrapper.text()).toContain('This adjustment would take the balance below zero.')
    expect(wrapper.text()).not.toContain('store_credit_balance_negative')
  })
})
