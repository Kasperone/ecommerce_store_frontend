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
