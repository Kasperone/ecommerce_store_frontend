import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin review moderation. Specs assert
 * on the URLs and verbs pushed at `apiFetch`.
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

describe('useReviewsQuery', () => {
  it('fetches /api/v1/admin/reviews/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useReviewsQuery } = await import('./useReviewQueries')

    await runInComponent(() =>
      useReviewsQuery({ page: 2, pageSize: 10, status: 'pending', rating: 4, productId: 3, search: 'bad' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reviews/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'pending',
      rating: 4,
      product_id: 3,
      search: 'bad',
    })
  })

  it('defaults page=1 / page_size=20 and omits empty search', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useReviewsQuery } = await import('./useReviewQueries')

    await runInComponent(() => useReviewsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.search).toBeUndefined()
    expect(options.query.status).toBeUndefined()
  })
})

describe('useModerateReview', () => {
  type Moderate = {
    mutateAsync: (v: { id: number, status?: string, adminResponse?: string | null }) => Promise<unknown>
  }

  it('PATCHes /api/v1/admin/reviews/{id} with the new status (no reply key)', async () => {
    apiFetch.mockResolvedValue({ id: 5, status: 'approved' })
    const { useModerateReview } = await import('./useReviewQueries')

    const result = (await runInComponent(() => useModerateReview())) as Moderate
    await result.mutateAsync({ id: 5, status: 'approved' })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reviews/5')
    expect(options.method).toBe('PATCH')
    expect(options.body).toEqual({ status: 'approved' })
  })

  it('sends only admin_response for a reply-only PATCH', async () => {
    apiFetch.mockResolvedValue({ id: 5 })
    const { useModerateReview } = await import('./useReviewQueries')

    const result = (await runInComponent(() => useModerateReview())) as Moderate
    await result.mutateAsync({ id: 5, adminResponse: 'Thanks for the feedback!' })

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.body).toEqual({ admin_response: 'Thanks for the feedback!' })
  })

  it('sends admin_response: null to clear a reply', async () => {
    apiFetch.mockResolvedValue({ id: 5 })
    const { useModerateReview } = await import('./useReviewQueries')

    const result = (await runInComponent(() => useModerateReview())) as Moderate
    await result.mutateAsync({ id: 5, adminResponse: null })

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.body).toEqual({ admin_response: null })
  })
})

describe('useDeleteReview', () => {
  it('DELETEs /api/v1/admin/reviews/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteReview } = await import('./useReviewQueries')

    const result = (await runInComponent(() => useDeleteReview())) as {
      mutateAsync: (id: number) => Promise<unknown>
    }
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reviews/9')
    expect(options.method).toBe('DELETE')
  })
})
