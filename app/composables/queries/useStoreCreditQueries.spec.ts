import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada layer for a customer's store credit (admin customers resource).
 * Specs assert on the URLs and verbs pushed at `apiFetch`.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, { global: { plugins: [pinia, PiniaColada] } })
  await nextTick()
  return captured
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe('useCustomerStoreCreditQuery', () => {
  it('fetches /api/v1/admin/customers/{id}/store-credit', async () => {
    apiFetch.mockResolvedValue({ accounts: [], entries: [] })
    const { useCustomerStoreCreditQuery } = await import('./useStoreCreditQueries')

    await runInComponent(() => useCustomerStoreCreditQuery(42))
    await nextTick()
    await tick()

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/admin/customers/42/store-credit')
  })

  it('stays disabled while the customer id is undefined', async () => {
    const { useCustomerStoreCreditQuery } = await import('./useStoreCreditQueries')

    await runInComponent(() => useCustomerStoreCreditQuery(undefined))
    await nextTick()
    await tick()

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useAdjustCustomerStoreCredit', () => {
  it('POSTs /api/v1/admin/customers/{id}/store-credit/adjust with the signed body', async () => {
    apiFetch.mockResolvedValue({ accounts: [], entries: [] })
    const { useAdjustCustomerStoreCredit } = await import('./useStoreCreditQueries')

    const result = (await runInComponent(() => useAdjustCustomerStoreCredit())) as any
    await result.mutateAsync({
      customerId: 42,
      body: { amount: 50, currency: 'EUR', note: 'goodwill' },
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/customers/42/store-credit/adjust')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ amount: 50, currency: 'EUR', note: 'goodwill' })
  })
})
