import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin customer segments. Specs assert
 * on the URLs and verbs pushed at `apiFetch` (the network boundary), including
 * the two imperative preview helpers.
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

describe('useSegmentsQuery', () => {
  it('fetches /api/v1/admin/segments/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useSegmentsQuery } = await import('./useSegmentQueries')

    await runInComponent(() =>
      useSegmentsQuery({ page: 2, pageSize: 10, isActive: true, search: 'VIP' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      is_active: true,
      search: 'VIP',
    })
  })

  it('defaults page=1 / page_size=20 and drops empty search', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useSegmentsQuery } = await import('./useSegmentQueries')

    await runInComponent(() => useSegmentsQuery({ search: '' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.search).toBeUndefined()
    expect(options.query.is_active).toBeUndefined()
  })
})

describe('useCreateSegment', () => {
  it('POSTs /api/v1/admin/segments/', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'VIP' })
    const { useCreateSegment } = await import('./useSegmentQueries')

    const result = (await runInComponent(() => useCreateSegment())) as any
    await result.mutateAsync({
      name: 'VIP',
      description: null,
      is_active: true,
      filters: { tag_match: 'any', min_order_count: 5 },
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'VIP', is_active: true })
  })
})

describe('useUpdateSegment', () => {
  it('PATCHes /api/v1/admin/segments/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Lapsed' })
    const { useUpdateSegment } = await import('./useSegmentQueries')

    const result = (await runInComponent(() => useUpdateSegment())) as any
    await result.mutateAsync({ id: 3, patch: { is_active: false } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ is_active: false })
  })
})

describe('useDeleteSegment', () => {
  it('DELETEs /api/v1/admin/segments/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteSegment } = await import('./useSegmentQueries')

    const result = (await runInComponent(() => useDeleteSegment())) as any
    await result.mutateAsync(5)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/5')
    expect(options.method).toBe('DELETE')
  })
})

describe('useSegmentPreview', () => {
  it('previewFilters POSTs an unsaved filter body to /preview with a limit', async () => {
    apiFetch.mockResolvedValue({ count: 12, sample: [] })
    const { useSegmentPreview } = await import('./useSegmentQueries')

    const result = (await runInComponent(() => useSegmentPreview())) as any
    const out = await result.previewFilters({ tag_match: 'all', min_order_count: 3 }, 5)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/preview')
    expect(options.method).toBe('POST')
    expect(options.query).toMatchObject({ limit: 5 })
    expect(options.body).toMatchObject({ tag_match: 'all', min_order_count: 3 })
    expect(out).toMatchObject({ count: 12 })
  })

  it('previewSaved GETs /{id}/preview with a limit', async () => {
    apiFetch.mockResolvedValue({ count: 7, sample: [] })
    const { useSegmentPreview } = await import('./useSegmentQueries')

    const result = (await runInComponent(() => useSegmentPreview())) as any
    await result.previewSaved(9, 0)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/segments/9/preview')
    expect(options.query).toMatchObject({ limit: 0 })
    expect(options.method).toBeUndefined()
  })
})
