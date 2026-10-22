import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin banners. Specs assert on the
 * URLs and verbs pushed at `apiFetch` (the network boundary).
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

describe('useBannersQuery', () => {
  it('fetches /api/v1/admin/banners/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useBannersQuery } = await import('./useBannerQueries')

    await runInComponent(() =>
      useBannersQuery({ page: 2, pageSize: 10, isActive: true, placement: 'home_hero' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/banners/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      is_active: true,
      placement: 'home_hero',
    })
  })

  it('defaults page=1 / page_size=20 and leaves is_active + placement undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useBannersQuery } = await import('./useBannerQueries')

    await runInComponent(() => useBannersQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.is_active).toBeUndefined()
    expect(options.query.placement).toBeUndefined()
  })
})

describe('useCreateBanner', () => {
  it('POSTs /api/v1/admin/banners/', async () => {
    apiFetch.mockResolvedValue({ id: 1, title: 'Summer hero' })
    const { useCreateBanner } = await import('./useBannerQueries')

    const result = (await runInComponent(() => useCreateBanner())) as any
    await result.mutateAsync({
      title: 'Summer hero',
      image_url: 'https://cdn/x.jpg',
      placement: 'home_hero',
      sort_order: 0,
      is_active: true,
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/banners/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ title: 'Summer hero', placement: 'home_hero' })
  })
})

describe('useUpdateBanner', () => {
  it('PATCHes /api/v1/admin/banners/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, title: 'Winter hero' })
    const { useUpdateBanner } = await import('./useBannerQueries')

    const result = (await runInComponent(() => useUpdateBanner())) as any
    await result.mutateAsync({ id: 3, patch: { sort_order: 5 } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/banners/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ sort_order: 5 })
  })
})

describe('useDeleteBanner', () => {
  it('DELETEs /api/v1/admin/banners/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteBanner } = await import('./useBannerQueries')

    const result = (await runInComponent(() => useDeleteBanner())) as any
    await result.mutateAsync(5)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/banners/5')
    expect(options.method).toBe('DELETE')
  })
})
