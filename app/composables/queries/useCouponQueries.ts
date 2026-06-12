/**
 * Pinia Colada query/mutation layer for admin coupons (discount codes).
 *
 * Cache keys are prefixed with `['coupons', ...]` so every mutation invalidates
 * the whole namespace with one call. All actions are non-optimistic (refetch
 * after success).
 *
 * The collection route is `/api/v1/admin/coupons/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Coupon types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type CouponResponse = components['schemas']['CouponResponse']
export type CouponListResponse = components['schemas']['CouponListResponse']
export type CouponCreate = components['schemas']['CouponCreate']
export type CouponUpdate = components['schemas']['CouponUpdate']
export type CouponDiscountType = CouponResponse['discount_type']
export type CouponCurrency = NonNullable<CouponResponse['currency']>

const COUPONS_NAMESPACE = ['coupons'] as const

export interface CouponListParams {
  page?: number
  pageSize?: number
  isActive?: boolean
  search?: string
}

export function useCouponsQuery(params: MaybeRefOrGetter<CouponListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COUPONS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CouponListResponse>('/api/v1/admin/coupons/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          is_active: p.isActive,
          search: p.search || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `POST /api/v1/admin/coupons/` — create a coupon (409 on duplicate code). */
export function useCreateCoupon() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: CouponCreate) =>
      apiFetch<CouponResponse>('/api/v1/admin/coupons/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COUPONS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/coupons/{id}` — edit a coupon (409 on code collision). */
export function useUpdateCoupon() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CouponUpdate }) =>
      apiFetch<CouponResponse>(`/api/v1/admin/coupons/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COUPONS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/coupons/{id}` — remove a coupon. */
export function useDeleteCoupon() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COUPONS_NAMESPACE] }),
  })
}
