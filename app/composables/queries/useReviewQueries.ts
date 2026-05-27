/**
 * Pinia Colada query/mutation layer for admin review moderation.
 *
 * Cache keys are prefixed `['reviews', ...]` so a moderate/delete invalidates the
 * whole namespace (refetch after success — non-optimistic).
 *
 * The list is `/api/v1/admin/reviews/` (trailing slash — FastAPI 307s the
 * slashless collection through the h3 proxy). `/{id}` is literal so it carries
 * no trailing slash.
 *
 * The list query is gated client-only (`enabled: () => import.meta.client`):
 * Colada's cache isn't SSR-serialized, so a server-run authed query would render
 * content the client can't reproduce at hydration. This is the project pattern
 * for authed admin queries.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AdminReviewListItem, AdminReviewListResponse } from '#shared/types/api'
import type { ReviewStatus } from '#shared/utils/reviewStatus'

export type ReviewModerationStatus = Exclude<ReviewStatus, 'pending'>

export interface ReviewListParams {
  page?: number
  pageSize?: number
  status?: ReviewStatus
  rating?: number
  productId?: number
  search?: string
}

const REVIEWS_NAMESPACE = ['reviews'] as const

export function useReviewsQuery(params: MaybeRefOrGetter<ReviewListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REVIEWS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<AdminReviewListResponse>('/api/v1/admin/reviews/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          rating: p.rating,
          product_id: p.productId,
          search: p.search || undefined,
        },
      })
    },
    enabled: () => import.meta.client,
  })
}

/** `PATCH /api/v1/admin/reviews/{id}` — approve or reject. Returns the updated row. */
export function useModerateReview() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, status }: { id: number, status: ReviewModerationStatus }) =>
      apiFetch<AdminReviewListItem>(`/api/v1/admin/reviews/${id}`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...REVIEWS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/reviews/{id}` — remove a review (204). */
export function useDeleteReview() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/reviews/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...REVIEWS_NAMESPACE] }),
  })
}
