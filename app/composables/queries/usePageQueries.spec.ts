import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the CMS page builder. Specs assert on
 * the URLs and verbs pushed at `apiFetch` (the network boundary).
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

async function settle() {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
}

describe('usePagesQuery', () => {
  it('fetches /api/v1/admin/pages/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { usePagesQuery } = await import('./usePageQueries')

    await runInComponent(() =>
      usePagesQuery({ page: 2, pageSize: 10, status: 'published', type: 'landing', locale: 'pl' }),
    )
    await settle()

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'published',
      type: 'landing',
      locale: 'pl',
    })
  })

  it('defaults page=1 / page_size=20 and leaves filters undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { usePagesQuery } = await import('./usePageQueries')

    await runInComponent(() => usePagesQuery({}))
    await settle()

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
    expect(options.query.type).toBeUndefined()
    expect(options.query.locale).toBeUndefined()
  })
})

describe('usePageQuery', () => {
  it('fetches /api/v1/admin/pages/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 7 })
    const { usePageQuery } = await import('./usePageQueries')

    await runInComponent(() => usePageQuery(7))
    await settle()

    expect(apiFetch.mock.calls[0][0]).toBe('/api/v1/admin/pages/7')
  })

  it('does not fire when id is null (enabled gate)', async () => {
    const { usePageQuery } = await import('./usePageQueries')
    await runInComponent(() => usePageQuery(null))
    await settle()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('usePageVersionsQuery', () => {
  it('fetches /api/v1/admin/pages/{id}/versions', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { usePageVersionsQuery } = await import('./usePageQueries')

    await runInComponent(() => usePageVersionsQuery(4))
    await settle()

    expect(apiFetch.mock.calls[0][0]).toBe('/api/v1/admin/pages/4/versions')
  })
})

describe('useBlockSchemasQuery', () => {
  it('fetches /api/v1/blocks/schema', async () => {
    apiFetch.mockResolvedValue({ blocks: [] })
    const { useBlockSchemasQuery } = await import('./usePageQueries')

    await runInComponent(() => useBlockSchemasQuery())
    await settle()

    expect(apiFetch.mock.calls[0][0]).toBe('/api/v1/blocks/schema')
  })
})

describe('useCreatePage', () => {
  it('POSTs /api/v1/admin/pages/', async () => {
    apiFetch.mockResolvedValue({ id: 1, slug: 'about' })
    const { useCreatePage } = await import('./usePageQueries')

    const result = (await runInComponent(() => useCreatePage())) as any
    await result.mutateAsync({ slug: 'about', type: 'standard', locale: 'en' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ slug: 'about' })
  })
})

describe('useSavePageDraft', () => {
  it('PATCHes /api/v1/admin/pages/{id}/draft', async () => {
    apiFetch.mockResolvedValue({ id: 3 })
    const { useSavePageDraft } = await import('./usePageQueries')

    const result = (await runInComponent(() => useSavePageDraft())) as any
    await result.mutateAsync({ id: 3, patch: { draft_layout: { sections: [] } } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/3/draft')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ draft_layout: { sections: [] } })
  })
})

describe('usePublishPage', () => {
  it('POSTs /api/v1/admin/pages/{id}/publish with a label', async () => {
    apiFetch.mockResolvedValue({ id: 3, status: 'published' })
    const { usePublishPage } = await import('./usePageQueries')

    const result = (await runInComponent(() => usePublishPage())) as any
    await result.mutateAsync({ id: 3, body: { label: 'v2' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/3/publish')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ label: 'v2' })
  })

  it('sends an empty body when no label is given', async () => {
    apiFetch.mockResolvedValue({ id: 3 })
    const { usePublishPage } = await import('./usePageQueries')

    const result = (await runInComponent(() => usePublishPage())) as any
    await result.mutateAsync({ id: 3 })

    expect(apiFetch.mock.calls[0][1].body).toEqual({})
  })
})

describe('useCreatePreviewToken', () => {
  it('POSTs /api/v1/admin/pages/{id}/preview-token', async () => {
    apiFetch.mockResolvedValue({ token: 'tok-abc', expires_at: '2026-06-05T00:10:00Z' })
    const { useCreatePreviewToken } = await import('./usePageQueries')

    const result = (await runInComponent(() => useCreatePreviewToken())) as any
    const res = await result.mutateAsync({ id: 5 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/5/preview-token')
    expect(options.method).toBe('POST')
    expect(res.token).toBe('tok-abc')
  })
})

describe('useRollbackPageVersion', () => {
  it('POSTs /api/v1/admin/pages/{id}/versions/{versionId}/rollback', async () => {
    apiFetch.mockResolvedValue({ id: 3 })
    const { useRollbackPageVersion } = await import('./usePageQueries')

    const result = (await runInComponent(() => useRollbackPageVersion())) as any
    await result.mutateAsync({ id: 3, versionId: 9 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/pages/3/versions/9/rollback')
    expect(options.method).toBe('POST')
  })
})
