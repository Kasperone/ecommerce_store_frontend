import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin manual collections. Specs assert
 * on the URLs, verbs, and bodies pushed at `apiFetch`.
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

describe('useCollectionsQuery', () => {
  it('fetches /api/v1/admin/collections/', async () => {
    apiFetch.mockResolvedValue([])
    const { useCollectionsQuery } = await import('./useCollectionQueries')

    await runInComponent(() => useCollectionsQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/collections/')
  })
})

describe('useCollectionProductsQuery', () => {
  it('fetches members via the product list filtered by collection_id', async () => {
    apiFetch.mockResolvedValue([])
    const { useCollectionProductsQuery } = await import('./useCollectionQueries')

    await runInComponent(() => useCollectionProductsQuery(() => 7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/')
    expect(options.query).toMatchObject({ collection_id: 7 })
  })
})

describe('useCreateCollection', () => {
  it('POSTs /api/v1/admin/collections/ with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Summer' })
    const { useCreateCollection } = await import('./useCollectionQueries')

    const result = await runInComponent(() => useCreateCollection()) as any
    await result.mutateAsync({ name: 'Summer', slug: 'summer', type: 'manual', is_active: true, sort_order: 0 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/collections/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'Summer', slug: 'summer' })
  })
})

describe('useUpdateCollection', () => {
  it('PUTs /api/v1/admin/collections/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Winter' })
    const { useUpdateCollection } = await import('./useCollectionQueries')

    const result = await runInComponent(() => useUpdateCollection()) as any
    await result.mutateAsync({ id: 3, patch: { name: 'Winter' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/collections/3')
    expect(options.method).toBe('PUT')
    expect(options.body).toMatchObject({ name: 'Winter' })
  })
})

describe('useDeleteCollection', () => {
  it('DELETEs /api/v1/admin/collections/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteCollection } = await import('./useCollectionQueries')

    const result = await runInComponent(() => useDeleteCollection()) as any
    await result.mutateAsync(8)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/collections/8')
    expect(options.method).toBe('DELETE')
  })
})

describe('useSetCollectionProducts', () => {
  it('PUTs the ordered product_ids to /{id}/products', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useSetCollectionProducts } = await import('./useCollectionQueries')

    const result = await runInComponent(() => useSetCollectionProducts()) as any
    await result.mutateAsync({ id: 4, productIds: [3, 1, 2] })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/collections/4/products')
    expect(options.method).toBe('PUT')
    expect(options.body).toEqual({ product_ids: [3, 1, 2] })
  })
})

describe('useUploadCollectionHero', () => {
  it('POSTs multipart to /{id}/hero', async () => {
    apiFetch.mockResolvedValue({ id: 2, hero_image_url: 'x' })
    const { useUploadCollectionHero } = await import('./useCollectionQueries')

    const result = await runInComponent(() => useUploadCollectionHero()) as any
    const formData = new FormData()
    await result.mutateAsync({ id: 2, formData })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/collections/2/hero')
    expect(options.method).toBe('POST')
  })
})
