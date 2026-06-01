import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin quotes. Specs assert on the
 * URLs and verbs pushed at `apiFetch` (the network boundary).
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

describe('useQuotesQuery', () => {
  it('fetches /api/v1/admin/quotes/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useQuotesQuery } = await import('./useQuoteQueries')

    await runInComponent(() =>
      useQuotesQuery({ page: 2, pageSize: 10, status: 'sent', companyId: 5 }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/quotes/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'sent',
      company_id: 5,
    })
  })

  it('defaults page=1 / page_size=20 and leaves status + company_id undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useQuotesQuery } = await import('./useQuoteQueries')

    await runInComponent(() => useQuotesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
    expect(options.query.company_id).toBeUndefined()
  })
})

describe('useQuoteQuery', () => {
  it('fetches /api/v1/admin/quotes/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 9, items: [] })
    const { useQuoteQuery } = await import('./useQuoteQueries')

    await runInComponent(() => useQuoteQuery(9))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/admin/quotes/9')
  })

  it('does not fetch when the id is undefined', async () => {
    const { useQuoteQuery } = await import('./useQuoteQueries')
    await runInComponent(() => useQuoteQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useCreateQuote', () => {
  it('POSTs /api/v1/admin/quotes/ with the items body', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useCreateQuote } = await import('./useQuoteQueries')

    const result = (await runInComponent(() => useCreateQuote())) as any
    await result.mutateAsync({
      company_id: 3,
      currency: 'PLN',
      valid_until: null,
      notes: null,
      items: [{ description: 'Widget', quantity: 2, unit_price: 10, product_id: null }],
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/quotes/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({
      company_id: 3,
      currency: 'PLN',
      items: [{ description: 'Widget', quantity: 2, unit_price: 10 }],
    })
  })
})

describe('useUpdateQuote', () => {
  it('PATCHes /api/v1/admin/quotes/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 4, status: 'accepted' })
    const { useUpdateQuote } = await import('./useQuoteQueries')

    const result = (await runInComponent(() => useUpdateQuote())) as any
    await result.mutateAsync({ id: 4, patch: { status: 'accepted' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/quotes/4')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ status: 'accepted' })
  })
})

describe('useDeleteQuote', () => {
  it('DELETEs /api/v1/admin/quotes/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteQuote } = await import('./useQuoteQueries')

    const result = (await runInComponent(() => useDeleteQuote())) as any
    await result.mutateAsync(7)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/quotes/7')
    expect(options.method).toBe('DELETE')
  })
})

describe('useQuoteCompaniesQuery', () => {
  it('fetches /api/v1/admin/companies/ for the picker', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useQuoteCompaniesQuery } = await import('./useQuoteQueries')

    await runInComponent(() => useQuoteCompaniesQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/companies/')
    expect(options.query).toMatchObject({ page: 1, page_size: 100 })
  })
})
