/**
 * Authed "helpful" vote operations for the storefront PDP.
 *
 * Client-only by nature (like `useMyReview`): the access token lives in a Pinia
 * ref, so these run after mount, not during SSR. The public approved-review list
 * (`useProductReviews`, SSR) carries each review's `helpful_count`; this adds the
 * caller's per-review vote state + the toggle on top.
 *
 * `vote`/`unvote` return the review's authoritative `helpful_count` + `my_vote`,
 * so the caller can reconcile an optimistic toggle without a refetch.
 */

import type { MyVotesResponse, ReviewVoteResponse } from '#shared/types/api'

export function useReviewVotes() {
  const { apiFetch } = useApi()
  return {
    /** The set of this product's review ids the caller has voted helpful on. */
    fetchMyVotes: async (productId: number): Promise<Set<number>> => {
      const res = await apiFetch<MyVotesResponse>(
        `/api/v1/products/${productId}/reviews/my-votes`,
      )
      return new Set(res.voted_review_ids)
    },
    vote: (productId: number, reviewId: number) =>
      apiFetch<ReviewVoteResponse>(
        `/api/v1/products/${productId}/reviews/${reviewId}/vote`,
        { method: 'PUT' },
      ),
    unvote: (productId: number, reviewId: number) =>
      apiFetch<ReviewVoteResponse>(
        `/api/v1/products/${productId}/reviews/${reviewId}/vote`,
        { method: 'DELETE' },
      ),
  }
}
