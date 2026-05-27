import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Thin authed helpful-vote wrapper over `useApi`. Specs assert the URLs + verbs
 * and that `fetchMyVotes` lifts the id list into a Set for O(1) pressed-state.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  apiFetch.mockResolvedValue({ voted_review_ids: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useReviewVotes', () => {
  it('fetchMyVotes GETs /products/{id}/reviews/my-votes and returns a Set', async () => {
    apiFetch.mockResolvedValue({ voted_review_ids: [3, 7] })
    const { useReviewVotes } = await import('./useReviewVotes')
    const voted = await useReviewVotes().fetchMyVotes(5)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/products/5/reviews/my-votes')
    expect(voted).toBeInstanceOf(Set)
    expect([...voted].sort()).toEqual([3, 7])
  })

  it('fetchMyVotes returns an empty Set when there are none', async () => {
    apiFetch.mockResolvedValue({ voted_review_ids: [] })
    const { useReviewVotes } = await import('./useReviewVotes')
    expect((await useReviewVotes().fetchMyVotes(5)).size).toBe(0)
  })

  it('vote PUTs /products/{pid}/reviews/{rid}/vote', async () => {
    apiFetch.mockResolvedValue({ review_id: 9, helpful_count: 1, my_vote: true })
    const { useReviewVotes } = await import('./useReviewVotes')
    await useReviewVotes().vote(5, 9)
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/5/reviews/9/vote')
    expect(options.method).toBe('PUT')
  })

  it('unvote DELETEs /products/{pid}/reviews/{rid}/vote', async () => {
    apiFetch.mockResolvedValue({ review_id: 9, helpful_count: 0, my_vote: false })
    const { useReviewVotes } = await import('./useReviewVotes')
    await useReviewVotes().unvote(5, 9)
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/5/reviews/9/vote')
    expect(options.method).toBe('DELETE')
  })
})
