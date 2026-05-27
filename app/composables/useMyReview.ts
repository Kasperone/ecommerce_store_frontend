/**
 * Authed own-review operations for the storefront PDP.
 *
 * Client-only by nature: the access token lives in a Pinia ref (never on the
 * server), so these run after mount, not during SSR. Public approved reviews
 * come from `useProductReviews` (SSR); this is the customer's single review for
 * a product — fetch-own / create / edit (re-queues to pending) / delete.
 *
 * `fetchMine` 404s when the customer hasn't reviewed yet — callers treat that as
 * "no review, show the form".
 */

import type { ReviewResponse } from '#shared/types/api'

export interface ReviewSubmitBody {
  rating: number
  title?: string | null
  body: string
}

export function useMyReview() {
  const { apiFetch } = useApi()
  return {
    fetchMine: (productId: number) =>
      apiFetch<ReviewResponse>(`/api/v1/products/${productId}/reviews/me`),
    create: (productId: number, body: ReviewSubmitBody) =>
      apiFetch<ReviewResponse>(`/api/v1/products/${productId}/reviews`, {
        method: 'POST',
        body,
      }),
    update: (productId: number, body: ReviewSubmitBody) =>
      apiFetch<ReviewResponse>(`/api/v1/products/${productId}/reviews/me`, {
        method: 'PUT',
        body,
      }),
    remove: (productId: number) =>
      apiFetch<unknown>(`/api/v1/products/${productId}/reviews/me`, { method: 'DELETE' }),
  }
}
