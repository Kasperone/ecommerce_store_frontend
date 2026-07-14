// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import StoreCreditField from './StoreCreditField.vue'

/**
 * Pins the store-credit toggle's gating (D7/D8: public toggle ON + signed in +
 * a positive same-currency balance) and the applied-amount math (D10:
 * min(balance, remaining)). All three gating inputs are mocked at their
 * boundaries; a real module-scope ref backs `useStoreConfig`/`useMyStoreCredit`
 * so the component's computeds react to `setProps`.
 */

const authState = { isAuthenticated: true }
const storeConfigData = ref<{ store_credit_enabled?: boolean } | null>({ store_credit_enabled: true })
const summaryData = ref<{ accounts: { currency: string, balance: number }[], entries: unknown[] } | null>({
  accounts: [{ currency: 'USD', balance: 40 }],
  entries: [],
})

mockNuxtImport('useAuthStore', () => () => ({
  get isAuthenticated() {
    return authState.isAuthenticated
  },
}))

mockNuxtImport('useStoreConfig', () => () => ({ data: storeConfigData }))

mockNuxtImport('useMyStoreCreditQuery', () => () => ({ data: summaryData }))

beforeEach(() => {
  authState.isAuthenticated = true
  storeConfigData.value = { store_credit_enabled: true }
  summaryData.value = { accounts: [{ currency: 'USD', balance: 40 }], entries: [] }
})

afterEach(() => {
  vi.clearAllMocks()
})

function mount(props: Record<string, unknown> = {}) {
  return mountSuspended(StoreCreditField, {
    props: { currency: 'USD', remaining: 100, modelValue: false, ...props },
  })
}

describe('CheckoutStoreCreditField — gating', () => {
  it('renders nothing when store_credit_enabled is off', async () => {
    storeConfigData.value = { store_credit_enabled: false }
    const wrapper = await mount()
    expect(wrapper.find('[data-testid="store-credit-field"]').exists()).toBe(false)
  })

  it('renders nothing when the customer is not authenticated', async () => {
    authState.isAuthenticated = false
    const wrapper = await mount()
    expect(wrapper.find('[data-testid="store-credit-field"]').exists()).toBe(false)
  })

  it('renders nothing when the balance in the order currency is zero', async () => {
    summaryData.value = { accounts: [{ currency: 'PLN', balance: 40 }], entries: [] }
    const wrapper = await mount({ currency: 'USD' })
    expect(wrapper.find('[data-testid="store-credit-field"]').exists()).toBe(false)
  })

  it('renders the toggle with the balance when enabled + authed + positive balance', async () => {
    const wrapper = await mount()
    expect(wrapper.find('[data-testid="store-credit-field"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('$40.00')
  })
})

describe('CheckoutStoreCreditField — apply math (D10)', () => {
  it('emits the applied amount = min(balance, remaining) when checked', async () => {
    const wrapper = await mount({ modelValue: true, remaining: 25 })
    // balance $40, remaining $25 → applies $25.
    expect(wrapper.emitted('update:applied')?.at(-1)?.[0]).toBe(25)
    expect(wrapper.find('[data-testid="store-credit-applies"]').text()).toContain('$25.00')
  })

  it('caps the applied amount at the balance when the remaining exceeds it', async () => {
    const wrapper = await mount({ modelValue: true, remaining: 100 })
    expect(wrapper.emitted('update:applied')?.at(-1)?.[0]).toBe(40)
  })

  it('applies 0 while unchecked', async () => {
    const wrapper = await mount({ modelValue: false, remaining: 100 })
    expect(wrapper.emitted('update:applied')?.at(-1)?.[0]).toBe(0)
    expect(wrapper.find('[data-testid="store-credit-applies"]').exists()).toBe(false)
  })

  it('emits update:modelValue when the checkbox is toggled', async () => {
    const wrapper = await mount({ modelValue: false })
    wrapper.findComponent({ name: 'UCheckbox' }).vm.$emit('update:modelValue', true)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(true)
  })

  it('releases the opt-in when it gates out (currency switch to a zero-balance currency)', async () => {
    const wrapper = await mount({ modelValue: true, currency: 'USD' })
    await wrapper.setProps({ currency: 'EUR' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
  })
})
