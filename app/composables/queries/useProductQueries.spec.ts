import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Mirrors useCategoryQueries.spec.ts shape. We assert URLs, methods, and
 * bodies pushed at `apiFetch`; Colada's caching/invalidation is upstream
 * territory.
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

describe('useProductsQuery', () => {
  it('fetches /api/v1/products with the params it receives', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 1 })
    const { useProductsQuery } = await import('./useProductQueries')

    await runInComponent(() => useProductsQuery({
      page: 2,
      pageSize: 50,
      categoryId: 3,
      isActive: true,
      isFeatured: false,
      minPrice: 5,
      maxPrice: 100,
      inStock: true,
      search: 'book',
    }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 50,
      category_id: 3,
      is_active: true,
      is_featured: false,
      min_price: 5,
      max_price: 100,
      in_stock: true,
      search: 'book',
    })
  })

  it('defaults page=1 / page_size=20 when not provided', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 1 })
    const { useProductsQuery } = await import('./useProductQueries')

    await runInComponent(() => useProductsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
  })
})

describe('useProductQuery', () => {
  it('fetches /api/v1/products/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 7, name: 'Book' })
    const { useProductQuery } = await import('./useProductQueries')

    await runInComponent(() => useProductQuery(7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/products/7')
  })

  it('does not fetch when id is undefined', async () => {
    const { useProductQuery } = await import('./useProductQueries')

    await runInComponent(() => useProductQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useCreateProduct', () => {
  it('POSTs to /api/v1/products with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Book', slug: 'book' })
    const { useCreateProduct } = await import('./useProductQueries')

    const result = await runInComponent(() => useCreateProduct()) as any
    await result.mutateAsync({
      name: 'Book',
      slug: 'book',
      price_usd: 9.99,
      price_pln: 39.99,
      price_eur: 8.99,
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'Book', slug: 'book' })
  })
})

describe('useUpdateProduct', () => {
  it('PUTs to /api/v1/products/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Book updated' })
    const { useUpdateProduct } = await import('./useProductQueries')

    const result = await runInComponent(() => useUpdateProduct()) as any
    await result.mutateAsync({ id: 1, patch: { name: 'Book updated' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/1')
    expect(options.method).toBe('PUT')
    expect(options.body).toMatchObject({ name: 'Book updated' })
  })
})

describe('useDeleteProduct', () => {
  it('DELETEs /api/v1/products/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteProduct } = await import('./useProductQueries')

    const result = await runInComponent(() => useDeleteProduct()) as any
    await result.mutateAsync(42)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/42')
    expect(options.method).toBe('DELETE')
  })
})
