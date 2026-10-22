import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the PRODUCT-tag vocabulary (distinct
 * from the customer-tag layer). Specs assert on the URLs and verbs pushed at
 * `apiFetch`.
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

describe('useProductTagsQuery', () => {
  it('fetches /api/v1/admin/product-tags/', async () => {
    apiFetch.mockResolvedValue([])
    const { useProductTagsQuery } = await import('./useProductTagQueries')

    await runInComponent(() => useProductTagsQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/product-tags/')
  })
})

describe('useCreateProductTag', () => {
  it('POSTs /api/v1/admin/product-tags/ with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'sale' })
    const { useCreateProductTag } = await import('./useProductTagQueries')

    const result = await runInComponent(() => useCreateProductTag()) as any
    await result.mutateAsync({ name: 'sale', color: '#22c55e' })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/product-tags/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'sale', color: '#22c55e' })
  })
})

describe('useUpdateProductTag', () => {
  it('PATCHes /api/v1/admin/product-tags/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 5, name: 'new-arrival' })
    const { useUpdateProductTag } = await import('./useProductTagQueries')

    const result = await runInComponent(() => useUpdateProductTag()) as any
    await result.mutateAsync({ id: 5, patch: { name: 'new-arrival' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/product-tags/5')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ name: 'new-arrival' })
  })
})

describe('useDeleteProductTag', () => {
  it('DELETEs /api/v1/admin/product-tags/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteProductTag } = await import('./useProductTagQueries')

    const result = await runInComponent(() => useDeleteProductTag()) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/product-tags/9')
    expect(options.method).toBe('DELETE')
  })
})
