import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin inventory. Specs assert on the
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

describe('useInventoryQuery', () => {
  it('fetches /api/v1/admin/inventory/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useInventoryQuery } = await import('./useInventoryQueries')

    await runInComponent(() =>
      useInventoryQuery({ page: 2, pageSize: 10, status: 'low_stock', search: 'bolt' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/inventory/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'low_stock',
      search: 'bolt',
    })
  })

  it('defaults page=1 / page_size=20 and omits empty search', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useInventoryQuery } = await import('./useInventoryQueries')

    await runInComponent(() => useInventoryQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.search).toBeUndefined()
    expect(options.query.status).toBeUndefined()
  })
})

describe('useInventoryMovementsQuery', () => {
  it('fetches /api/v1/admin/inventory/movements with product_id', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useInventoryMovementsQuery } = await import('./useInventoryQueries')

    await runInComponent(() => useInventoryMovementsQuery({ productId: 7, page: 3 }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/inventory/movements')
    expect(options.query).toMatchObject({ page: 3, page_size: 20, product_id: 7 })
  })
})

describe('useProductLevels', () => {
  it('fetches /api/v1/admin/inventory/products/{id}/levels', async () => {
    apiFetch.mockResolvedValue([])
    const { useProductLevels } = await import('./useInventoryQueries')

    await runInComponent(() => useProductLevels(7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/admin/inventory/products/7/levels')
  })
})

describe('useAdjustStock', () => {
  it('PATCHes products/{id}/stock with warehouse_id + new_stock + note', async () => {
    apiFetch.mockResolvedValue({ id: 1, delta: 5, resulting_stock: 15 })
    const { useAdjustStock } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useAdjustStock())) as any
    await result.mutateAsync({ productId: 4, warehouseId: 2, newStock: 15, note: 'recount' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/inventory/products/4/stock')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ warehouse_id: 2, new_stock: 15, note: 'recount' })
  })

  it('omits an empty note', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useAdjustStock } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useAdjustStock())) as any
    await result.mutateAsync({ productId: 4, warehouseId: 1, newStock: 0 })

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.body).toMatchObject({ warehouse_id: 1, new_stock: 0 })
    expect(options.body.note).toBeUndefined()
  })
})

describe('useRestock', () => {
  it('POSTs products/{id}/restock with warehouse_id + quantity', async () => {
    apiFetch.mockResolvedValue({ id: 1, delta: 5 })
    const { useRestock } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useRestock())) as any
    await result.mutateAsync({ productId: 4, warehouseId: 2, quantity: 5, note: 'PO-1' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/inventory/products/4/restock')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ warehouse_id: 2, quantity: 5, note: 'PO-1' })
  })
})

describe('useTransferStock', () => {
  it('POSTs /transfer with the from/to/quantity payload', async () => {
    apiFetch.mockResolvedValue({ product_id: 4, from_resulting_stock: 5, to_resulting_stock: 3 })
    const { useTransferStock } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useTransferStock())) as any
    await result.mutateAsync({
      productId: 4,
      fromWarehouseId: 1,
      toWarehouseId: 2,
      quantity: 3,
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/inventory/transfer')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({
      product_id: 4,
      from_warehouse_id: 1,
      to_warehouse_id: 2,
      quantity: 3,
    })
  })
})

describe('useSetLowStockThreshold', () => {
  it('PUTs /api/v1/products/{id} with low_stock_threshold', async () => {
    apiFetch.mockResolvedValue({ id: 9, low_stock_threshold: 5 })
    const { useSetLowStockThreshold } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useSetLowStockThreshold())) as any
    await result.mutateAsync({ productId: 9, threshold: 5 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/9')
    expect(options.method).toBe('PUT')
    expect(options.body).toMatchObject({ low_stock_threshold: 5 })
  })

  it('sends null to clear the threshold', async () => {
    apiFetch.mockResolvedValue({ id: 9, low_stock_threshold: null })
    const { useSetLowStockThreshold } = await import('./useInventoryQueries')

    const result = (await runInComponent(() => useSetLowStockThreshold())) as any
    await result.mutateAsync({ productId: 9, threshold: null })

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.body).toMatchObject({ low_stock_threshold: null })
  })
})
