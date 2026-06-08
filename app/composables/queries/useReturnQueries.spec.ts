import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for Returns/RMA. Specs assert on the URLs
 * and methods pushed at `apiFetch` — that customer + admin actions hit the
 * right endpoints with the right verbs (incl. the trailing slash on the admin
 * collection route).
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

describe('useReturnEligibilityQuery', () => {
  it('fetches /api/v1/orders/{id}/returns/eligibility', async () => {
    apiFetch.mockResolvedValue({ eligible: true, lines: [] })
    const { useReturnEligibilityQuery } = await import('./useReturnQueries')

    await runInComponent(() => useReturnEligibilityQuery(7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/7/returns/eligibility')
  })

  it('does not fetch when the order id is undefined', async () => {
    const { useReturnEligibilityQuery } = await import('./useReturnQueries')

    await runInComponent(() => useReturnEligibilityQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useOrderReturnsQuery', () => {
  it('fetches /api/v1/orders/{id}/returns', async () => {
    apiFetch.mockResolvedValue([])
    const { useOrderReturnsQuery } = await import('./useReturnQueries')

    await runInComponent(() => useOrderReturnsQuery(11))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/11/returns')
  })
})

describe('useCreateReturnRequest', () => {
  it('POSTs /api/v1/orders/{id}/returns with the request body', async () => {
    apiFetch.mockResolvedValue({ id: 1, status: 'requested' })
    const { useCreateReturnRequest } = await import('./useReturnQueries')

    const result = await runInComponent(() => useCreateReturnRequest()) as any
    await result.mutateAsync({
      orderId: 7,
      request: {
        items: [{ order_item_id: 11, quantity: 1, reason: 'defective' }],
        comment: 'Cracked on arrival',
      },
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/orders/7/returns')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({
      items: [{ order_item_id: 11, quantity: 1, reason: 'defective' }],
      comment: 'Cracked on arrival',
    })
  })
})

describe('useAdminReturnsQuery', () => {
  it('fetches /api/v1/admin/returns/ (trailing slash) with paging + status', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0 })
    const { useAdminReturnsQuery } = await import('./useReturnQueries')

    await runInComponent(() => useAdminReturnsQuery({ page: 2, pageSize: 10, status: 'requested' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/returns/')
    expect(options.query).toMatchObject({ page: 2, page_size: 10, status: 'requested' })
  })

  it('defaults page=1 / page_size=20 and omits status', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0 })
    const { useAdminReturnsQuery } = await import('./useReturnQueries')

    await runInComponent(() => useAdminReturnsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
  })
})

describe('useAdminReturnQuery', () => {
  it('fetches /api/v1/admin/returns/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3 })
    const { useAdminReturnQuery } = await import('./useReturnQueries')

    await runInComponent(() => useAdminReturnQuery(3))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/returns/3')
  })
})

describe('useReturnTransition', () => {
  it.each(['approve', 'reject', 'receive'] as const)(
    'POSTs /api/v1/admin/returns/{id}/%s with the admin note',
    async (action) => {
      apiFetch.mockResolvedValue({ id: 3, status: 'approved' })
      const { useReturnTransition } = await import('./useReturnQueries')

      const result = await runInComponent(() => useReturnTransition()) as any
      await result.mutateAsync({ id: 3, action, adminNote: 'ok' })

      const [url, options] = apiFetch.mock.calls[0]
      expect(url).toBe(`/api/v1/admin/returns/3/${action}`)
      expect(options.method).toBe('POST')
      expect(options.body).toMatchObject({ admin_note: 'ok' })
    },
  )

  it('sends admin_note=null when no note is given', async () => {
    apiFetch.mockResolvedValue({ id: 3, status: 'approved' })
    const { useReturnTransition } = await import('./useReturnQueries')

    const result = await runInComponent(() => useReturnTransition()) as any
    await result.mutateAsync({ id: 3, action: 'approve' })

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.body).toMatchObject({ admin_note: null })
  })
})

describe('useReturnRefund', () => {
  it('POSTs /api/v1/admin/returns/{id}/refund with the refund body', async () => {
    apiFetch.mockResolvedValue({ id: 3, status: 'refunded' })
    const { useReturnRefund } = await import('./useReturnQueries')

    const result = await runInComponent(() => useReturnRefund()) as any
    await result.mutateAsync({
      id: 3,
      refund: { amount: 25, restock: true, reason: 'customer_request', note: null },
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/returns/3/refund')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ amount: 25, restock: true, reason: 'customer_request' })
  })
})
