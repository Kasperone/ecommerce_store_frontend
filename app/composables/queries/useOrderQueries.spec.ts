import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for orders. Specs assert on the URLs and
 * methods pushed at `apiFetch` — only that admin actions hit the right
 * endpoints with the right verbs.
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
  mount(harness, {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
  await nextTick()
  return captured
}

describe('useOrdersQuery', () => {
  it('fetches /api/v1/orders/ with paging + status', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useOrdersQuery } = await import('./useOrderQueries')

    await runInComponent(() => useOrdersQuery({ page: 2, pageSize: 10, status: 'pending' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/orders/')
    expect(options.query).toMatchObject({ page: 2, page_size: 10, status: 'pending' })
  })

  it('defaults page=1 / page_size=20 and omits status', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useOrdersQuery } = await import('./useOrderQueries')

    await runInComponent(() => useOrdersQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
  })

  it('threads dateFrom/dateTo as date_from/date_to', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useOrdersQuery } = await import('./useOrderQueries')

    await runInComponent(() => useOrdersQuery({ dateFrom: '2026-05-01', dateTo: '2026-05-31' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ date_from: '2026-05-01', date_to: '2026-05-31' })
  })
})

describe('useOrderQuery', () => {
  it('fetches /api/v1/orders/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 7 })
    const { useOrderQuery } = await import('./useOrderQueries')

    await runInComponent(() => useOrderQuery(7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/7')
  })

  it('does not fetch when id is undefined', async () => {
    const { useOrderQuery } = await import('./useOrderQueries')

    await runInComponent(() => useOrderQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useUpdateOrder', () => {
  it('PATCHes /api/v1/orders/{id} with the body', async () => {
    apiFetch.mockResolvedValue({ id: 3, status: 'paid' })
    const { useUpdateOrder } = await import('./useOrderQueries')

    const result = await runInComponent(() => useUpdateOrder()) as any
    await result.mutateAsync({ id: 3, patch: { status: 'paid', notes: 'ok' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/orders/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ status: 'paid', notes: 'ok' })
  })
})

describe('useCancelOrder', () => {
  it('POSTs /api/v1/orders/{id}/cancel', async () => {
    apiFetch.mockResolvedValue({ id: 9, status: 'cancelled' })
    const { useCancelOrder } = await import('./useOrderQueries')

    const result = await runInComponent(() => useCancelOrder()) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/orders/9/cancel')
    expect(options.method).toBe('POST')
  })
})

describe('useCreateOrder', () => {
  it('POSTs /api/v1/orders/ with the order body', async () => {
    apiFetch.mockResolvedValue({ id: 1, order_number: 'ORD-1', status: 'pending' })
    const { useCreateOrder } = await import('./useOrderQueries')

    const result = await runInComponent(() => useCreateOrder()) as any
    await result.mutateAsync({
      shipping_address: '1 Main St',
      shipping_city: 'Town',
      shipping_postal_code: '00-001',
      shipping_country: 'PL',
      currency: 'PLN',
      items: [{ product_id: 8, quantity: 2 }],
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/orders/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ currency: 'PLN', items: [{ product_id: 8, quantity: 2 }] })
  })
})
