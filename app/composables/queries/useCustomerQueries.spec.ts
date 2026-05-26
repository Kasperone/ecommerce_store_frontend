import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin customers. Specs assert on the
 * URLs and verbs pushed at `apiFetch`.
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

describe('useCustomersQuery', () => {
  it('fetches /api/v1/admin/customers/ with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCustomersQuery } = await import('./useCustomerQueries')

    await runInComponent(() =>
      useCustomersQuery({ page: 2, pageSize: 10, role: 'CUSTOMER', isActive: true, search: 'zoe' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      role: 'CUSTOMER',
      is_active: true,
      search: 'zoe',
    })
  })

  it('defaults page=1 / page_size=20 and omits empty search', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCustomersQuery } = await import('./useCustomerQueries')

    await runInComponent(() => useCustomersQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.search).toBeUndefined()
  })
})

describe('useCustomerQuery', () => {
  it('fetches /api/v1/admin/customers/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 5 })
    const { useCustomerQuery } = await import('./useCustomerQueries')

    await runInComponent(() => useCustomerQuery(5))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/customers/5')
  })

  it('does not fetch when id is undefined', async () => {
    const { useCustomerQuery } = await import('./useCustomerQueries')

    await runInComponent(() => useCustomerQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useUpdateCustomer', () => {
  it('PATCHes /api/v1/admin/customers/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, is_active: false })
    const { useUpdateCustomer } = await import('./useCustomerQueries')

    const result = await runInComponent(() => useUpdateCustomer()) as any
    await result.mutateAsync({ id: 3, patch: { is_active: false } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ is_active: false })
  })
})

describe('useUnlockCustomer', () => {
  it('POSTs /api/v1/admin/customers/{id}/unlock', async () => {
    apiFetch.mockResolvedValue({ id: 8 })
    const { useUnlockCustomer } = await import('./useCustomerQueries')

    const result = await runInComponent(() => useUnlockCustomer()) as any
    await result.mutateAsync(8)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/8/unlock')
    expect(options.method).toBe('POST')
  })
})

describe('useSendCustomerPasswordReset', () => {
  it('POSTs /api/v1/admin/customers/{id}/password-reset', async () => {
    apiFetch.mockResolvedValue({ message: 'ok' })
    const { useSendCustomerPasswordReset } = await import('./useCustomerQueries')

    const result = await runInComponent(() => useSendCustomerPasswordReset()) as any
    await result.mutateAsync(11)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/11/password-reset')
    expect(options.method).toBe('POST')
  })
})
