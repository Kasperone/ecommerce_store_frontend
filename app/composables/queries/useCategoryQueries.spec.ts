import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer. Specs assert on the URLs and methods
 * pushed at `apiFetch` — Colada's own caching/invalidation is covered by
 * upstream tests; here we only care that admin actions hit the right
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

describe('useCategoriesQuery', () => {
  it('fetches /api/v1/categories with the params it receives', async () => {
    apiFetch.mockResolvedValue([])
    const { useCategoriesQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoriesQuery({ isActive: true, skip: 0, limit: 50 }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories')
    expect(options.query).toMatchObject({ is_active: true, skip: 0, limit: 50 })
  })

  it('defaults skip=0 / limit=100 when not provided', async () => {
    apiFetch.mockResolvedValue([])
    const { useCategoriesQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoriesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ skip: 0, limit: 100 })
  })
})

describe('useCreateCategory', () => {
  it('POSTs to /api/v1/categories with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Books', slug: 'books' })
    const { useCreateCategory } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useCreateCategory()) as any
    await result.mutateAsync({ name: 'Books', slug: 'books', is_active: true })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'Books', slug: 'books' })
  })
})

describe('useUpdateCategory', () => {
  it('PUTs to /api/v1/categories/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Books', slug: 'books-updated' })
    const { useUpdateCategory } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useUpdateCategory()) as any
    await result.mutateAsync({ id: 1, patch: { slug: 'books-updated' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/1')
    expect(options.method).toBe('PUT')
    expect(options.body).toMatchObject({ slug: 'books-updated' })
  })
})

describe('useDeleteCategory', () => {
  it('DELETEs /api/v1/categories/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteCategory } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useDeleteCategory()) as any
    await result.mutateAsync(42)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/42')
    expect(options.method).toBe('DELETE')
  })
})

describe('useCategoryTreeQuery', () => {
  it('fetches /api/v1/categories/tree with is_active param', async () => {
    apiFetch.mockResolvedValue([])
    const { useCategoryTreeQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoryTreeQuery({ isActive: true }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/tree')
    expect(options.query).toMatchObject({ is_active: true })
  })

  it('omits is_active when not supplied', async () => {
    apiFetch.mockResolvedValue([])
    const { useCategoryTreeQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoryTreeQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query.is_active).toBeUndefined()
  })
})

describe('useBulkReorderCategories', () => {
  it('POSTs the items array to /api/v1/categories/bulk-reorder', async () => {
    apiFetch.mockResolvedValue([])
    const { useBulkReorderCategories } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useBulkReorderCategories()) as any
    await result.mutateAsync({
      items: [
        { id: 1, parent_id: null, sort_order: 0 },
        { id: 2, parent_id: null, sort_order: 1 },
      ],
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/bulk-reorder')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      items: [
        { id: 1, parent_id: null, sort_order: 0 },
        { id: 2, parent_id: null, sort_order: 1 },
      ],
    })
  })
})

describe('useDeleteCategoryWithMode', () => {
  it('passes mode=cascade as a query param', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteCategoryWithMode } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useDeleteCategoryWithMode()) as any
    await result.mutateAsync({ id: 7, mode: 'cascade' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/7')
    expect(options.method).toBe('DELETE')
    expect(options.query).toEqual({ mode: 'cascade' })
  })

  it('passes mode=reparent_to_root for the reparent path', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteCategoryWithMode } = await import('./useCategoryQueries')

    const result = await runInComponent(() => useDeleteCategoryWithMode()) as any
    await result.mutateAsync({ id: 9, mode: 'reparent_to_root' })

    const [, options] = apiFetch.mock.calls[0]
    expect(options.query).toEqual({ mode: 'reparent_to_root' })
  })
})

describe('useUploadCategoryHero', () => {
  it('POSTs multipart to /api/v1/categories/{id}/hero', async () => {
    apiFetch.mockResolvedValue({ id: 1, hero_image_url: 'https://r2/h.png' })
    const { useUploadCategoryHero } = await import('./useCategoryQueries')
    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'hero.png')

    const result = await runInComponent(() => useUploadCategoryHero()) as any
    await result.mutateAsync({ id: 7, formData })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/7/hero')
    expect(options.method).toBe('POST')
    expect(options.body).toBe(formData)
  })
})

describe('useUpdateCategoryHeroAlt', () => {
  it('PATCHes the alt text to /hero', async () => {
    apiFetch.mockResolvedValue({ id: 9 })
    const { useUpdateCategoryHeroAlt } = await import('./useCategoryQueries')
    const result = await runInComponent(() => useUpdateCategoryHeroAlt()) as any
    await result.mutateAsync({ id: 9, patch: { hero_image_alt: 'A photo' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/9/hero')
    expect(options.method).toBe('PATCH')
    expect(options.body).toEqual({ hero_image_alt: 'A photo' })
  })
})

describe('useDeleteCategoryHero', () => {
  it('DELETEs /hero', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteCategoryHero } = await import('./useCategoryQueries')
    const result = await runInComponent(() => useDeleteCategoryHero()) as any
    await result.mutateAsync(12)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/12/hero')
    expect(options.method).toBe('DELETE')
  })
})

describe('useCategoryDeletePreviewQuery', () => {
  it('fetches /api/v1/categories/{id}/delete-preview', async () => {
    apiFetch.mockResolvedValue({
      descendant_count: 0,
      direct_product_count: 0,
      subtree_product_count: 0,
    })
    const { useCategoryDeletePreviewQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoryDeletePreviewQuery(5))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/categories/5/delete-preview')
  })

  it('stays disabled when id is undefined', async () => {
    apiFetch.mockResolvedValue({})
    const { useCategoryDeletePreviewQuery } = await import('./useCategoryQueries')

    await runInComponent(() => useCategoryDeletePreviewQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})
