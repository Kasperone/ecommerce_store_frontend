import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin campaigns. Specs assert on the
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

describe('useCampaignsQuery', () => {
  it('fetches /api/v1/admin/campaigns/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCampaignsQuery } = await import('./useCampaignQueries')

    await runInComponent(() =>
      useCampaignsQuery({ page: 2, pageSize: 10, status: 'scheduled', audience: 'b2b', search: 'Spring' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/campaigns/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'scheduled',
      audience: 'b2b',
      search: 'Spring',
    })
  })

  it('defaults page=1 / page_size=20 and leaves status + audience + search undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCampaignsQuery } = await import('./useCampaignQueries')

    await runInComponent(() => useCampaignsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
    expect(options.query.audience).toBeUndefined()
    expect(options.query.search).toBeUndefined()
  })

  it('drops an empty search string to undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useCampaignsQuery } = await import('./useCampaignQueries')

    await runInComponent(() => useCampaignsQuery({ search: '' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[1].query.search).toBeUndefined()
  })
})

describe('useCreateCampaign', () => {
  it('POSTs /api/v1/admin/campaigns/', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Spring' })
    const { useCreateCampaign } = await import('./useCampaignQueries')

    const result = (await runInComponent(() => useCreateCampaign())) as any
    await result.mutateAsync({
      name: 'Spring',
      subject: 'Spring sale',
      audience: 'all',
      status: 'draft',
      body: null,
      scheduled_at: null,
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/campaigns/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'Spring', audience: 'all', status: 'draft' })
  })
})

describe('useUpdateCampaign', () => {
  it('PATCHes /api/v1/admin/campaigns/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Winter' })
    const { useUpdateCampaign } = await import('./useCampaignQueries')

    const result = (await runInComponent(() => useUpdateCampaign())) as any
    await result.mutateAsync({ id: 3, patch: { status: 'sent' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/campaigns/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ status: 'sent' })
  })
})

describe('useSendCampaign', () => {
  it('POSTs /api/v1/admin/campaigns/{id}/send', async () => {
    apiFetch.mockResolvedValue({ id: 9, name: 'Spring', status: 'sent' })
    const { useSendCampaign } = await import('./useCampaignQueries')

    const result = (await runInComponent(() => useSendCampaign())) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/campaigns/9/send')
    expect(options.method).toBe('POST')
  })
})

describe('useDeleteCampaign', () => {
  it('DELETEs /api/v1/admin/campaigns/{id}', async () => {
    apiFetch.mockResolvedValue(null)
    const { useDeleteCampaign } = await import('./useCampaignQueries')

    const result = (await runInComponent(() => useDeleteCampaign())) as any
    await result.mutateAsync(5)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/campaigns/5')
    expect(options.method).toBe('DELETE')
  })
})
