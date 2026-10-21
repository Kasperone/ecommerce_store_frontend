import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the admin company directory. Specs
 * assert on the URLs and verbs pushed at `apiFetch` (the network boundary).
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

describe('useCompaniesQuery', () => {
  it('fetches /api/v1/admin/companies/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCompaniesQuery } = await import('./useCompanyQueries')

    await runInComponent(() =>
      useCompaniesQuery({ page: 2, pageSize: 10, status: 'approved', search: 'Acme' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/companies/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'approved',
      search: 'Acme',
    })
  })

  it('defaults page=1 / page_size=20 and leaves status + search undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCompaniesQuery } = await import('./useCompanyQueries')

    await runInComponent(() => useCompaniesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
    expect(options.query.search).toBeUndefined()
  })

  it('drops an empty search string to undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCompaniesQuery } = await import('./useCompanyQueries')

    await runInComponent(() => useCompaniesQuery({ search: '' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[1].query.search).toBeUndefined()
  })
})

describe('useCreateCompany', () => {
  it('POSTs /api/v1/admin/companies/', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Acme' })
    const { useCreateCompany } = await import('./useCompanyQueries')

    const result = (await runInComponent(() => useCreateCompany())) as any
    await result.mutateAsync({ name: 'Acme', status: 'pending' })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/companies/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'Acme', status: 'pending' })
  })
})

describe('useUpdateCompany', () => {
  it('PATCHes /api/v1/admin/companies/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Globex' })
    const { useUpdateCompany } = await import('./useCompanyQueries')

    const result = (await runInComponent(() => useUpdateCompany())) as any
    await result.mutateAsync({ id: 3, patch: { status: 'approved' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/companies/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ status: 'approved' })
  })
})

describe('useDeleteCompany', () => {
  it('DELETEs /api/v1/admin/companies/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteCompany } = await import('./useCompanyQueries')

    const result = (await runInComponent(() => useDeleteCompany())) as any
    await result.mutateAsync(5)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/companies/5')
    expect(options.method).toBe('DELETE')
  })
})
