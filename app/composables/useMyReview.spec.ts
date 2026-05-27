import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Thin authed own-review wrapper over `useApi`. Specs assert the URLs + verbs.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  apiFetch.mockResolvedValue({ id: 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMyReview', () => {
  it('fetchMine GETs /products/{id}/reviews/me', async () => {
    const { useMyReview } = await import('./useMyReview')
    await useMyReview().fetchMine(7)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/products/7/reviews/me')
  })

  it('create POSTs /products/{id}/reviews with the body', async () => {
    const { useMyReview } = await import('./useMyReview')
    await useMyReview().create(7, { rating: 5, title: 'Nice', body: 'Works great.' })
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/7/reviews')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ rating: 5, title: 'Nice', body: 'Works great.' })
  })

  it('update PUTs /products/{id}/reviews/me', async () => {
    const { useMyReview } = await import('./useMyReview')
    await useMyReview().update(7, { rating: 3, body: 'Changed my mind.' })
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/7/reviews/me')
    expect(options.method).toBe('PUT')
  })

  it('remove DELETEs /products/{id}/reviews/me', async () => {
    const { useMyReview } = await import('./useMyReview')
    await useMyReview().remove(7)
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/7/reviews/me')
    expect(options.method).toBe('DELETE')
  })
})
