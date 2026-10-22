import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin warehouses. Specs assert on the
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

describe('useWarehousesQuery', () => {
  it('fetches /api/v1/admin/warehouses/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useWarehousesQuery } = await import('./useWarehouseQueries')

    await runInComponent(() => useWarehousesQuery({ page: 2, pageSize: 10, isActive: true }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/warehouses/')
    expect(options.query).toMatchObject({ page: 2, page_size: 10, is_active: true })
  })

  it('defaults page=1 / page_size=50 and leaves is_active undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useWarehousesQuery } = await import('./useWarehouseQueries')

    await runInComponent(() => useWarehousesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 50 })
    expect(options.query.is_active).toBeUndefined()
  })
})

describe('useCreateWarehouse', () => {
  it('POSTs /api/v1/admin/warehouses/', async () => {
    apiFetch.mockResolvedValue({ id: 1, code: 'EU-1' })
    const { useCreateWarehouse } = await import('./useWarehouseQueries')

    const result = (await runInComponent(() => useCreateWarehouse())) as any
    await result.mutateAsync({ name: 'Europe', code: 'EU-1', is_active: true, is_default: false })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/warehouses/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ code: 'EU-1', is_default: false })
  })
})

describe('useUpdateWarehouse', () => {
  it('PATCHes /api/v1/admin/warehouses/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Renamed' })
    const { useUpdateWarehouse } = await import('./useWarehouseQueries')

    const result = (await runInComponent(() => useUpdateWarehouse())) as any
    await result.mutateAsync({ id: 3, patch: { name: 'Renamed' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/warehouses/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ name: 'Renamed' })
  })
})

describe('useDeleteWarehouse', () => {
  it('DELETEs /api/v1/admin/warehouses/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteWarehouse } = await import('./useWarehouseQueries')

    const result = (await runInComponent(() => useDeleteWarehouse())) as any
    await result.mutateAsync(5)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/warehouses/5')
    expect(options.method).toBe('DELETE')
  })
})
