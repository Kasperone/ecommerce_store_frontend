/**
 * Pinia Colada query/mutation layer for admin banners (homepage hero + promo strip CMS).
 *
 * Cache keys are prefixed with `['banners', ...]` so every mutation invalidates
 * the whole namespace with one call. All actions are non-optimistic (refetch
 * after success).
 *
 * The collection route is `/api/v1/admin/banners/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Banner types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type BannerResponse = components['schemas']['BannerResponse']
export type BannerListResponse = components['schemas']['BannerListResponse']
export type BannerCreate = components['schemas']['BannerCreate']
export type BannerUpdate = components['schemas']['BannerUpdate']
export type BannerPlacement = BannerResponse['placement']

const BANNERS_NAMESPACE = ['banners'] as const

export interface BannerListParams {
  page?: number
  pageSize?: number
  isActive?: boolean
  placement?: BannerPlacement
}

export function useBannersQuery(params: MaybeRefOrGetter<BannerListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...BANNERS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<BannerListResponse>('/api/v1/admin/banners/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          is_active: p.isActive,
          placement: p.placement || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `POST /api/v1/admin/banners/` — create a banner. */
export function useCreateBanner() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: BannerCreate) =>
      apiFetch<BannerResponse>('/api/v1/admin/banners/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...BANNERS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/banners/{id}` — edit a banner (changed fields only). */
export function useUpdateBanner() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: BannerUpdate }) =>
      apiFetch<BannerResponse>(`/api/v1/admin/banners/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...BANNERS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/banners/{id}` — remove a banner. */
export function useDeleteBanner() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/banners/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...BANNERS_NAMESPACE] }),
  })
}
