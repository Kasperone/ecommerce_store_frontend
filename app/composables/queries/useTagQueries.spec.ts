import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the customer-tag vocabulary +
 * assignment. Specs assert on the URLs and verbs pushed at `apiFetch`.
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

describe('useTagsQuery', () => {
  it('fetches /api/v1/admin/tags/', async () => {
    apiFetch.mockResolvedValue([])
    const { useTagsQuery } = await import('./useTagQueries')

    await runInComponent(() => useTagsQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/tags/')
  })
})

describe('useCreateTag', () => {
  it('POSTs /api/v1/admin/tags/ with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'VIP' })
    const { useCreateTag } = await import('./useTagQueries')

    const result = await runInComponent(() => useCreateTag()) as any
    await result.mutateAsync({ name: 'VIP', color: '#3b82f6' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tags/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'VIP', color: '#3b82f6' })
  })
})

describe('useUpdateTag', () => {
  it('PATCHes /api/v1/admin/tags/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 5, name: 'Gold' })
    const { useUpdateTag } = await import('./useTagQueries')

    const result = await runInComponent(() => useUpdateTag()) as any
    await result.mutateAsync({ id: 5, patch: { name: 'Gold' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tags/5')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ name: 'Gold' })
  })
})

describe('useDeleteTag', () => {
  it('DELETEs /api/v1/admin/tags/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteTag } = await import('./useTagQueries')

    const result = await runInComponent(() => useDeleteTag()) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tags/9')
    expect(options.method).toBe('DELETE')
  })
})

describe('useAttachTag', () => {
  it('POSTs /api/v1/admin/customers/{id}/tags with the body', async () => {
    apiFetch.mockResolvedValue([])
    const { useAttachTag } = await import('./useTagQueries')

    const result = await runInComponent(() => useAttachTag()) as any
    await result.mutateAsync({ customerId: 4, body: { name: 'New' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/4/tags')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'New' })
  })
})

describe('useDetachTag', () => {
  it('DELETEs /api/v1/admin/customers/{id}/tags/{tagId}', async () => {
    apiFetch.mockResolvedValue([])
    const { useDetachTag } = await import('./useTagQueries')

    const result = await runInComponent(() => useDetachTag()) as any
    await result.mutateAsync({ customerId: 4, tagId: 7 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/4/tags/7')
    expect(options.method).toBe('DELETE')
  })
})
