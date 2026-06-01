/**
 * Pinia Colada query/mutation layer for admin email campaigns.
 *
 * Cache keys are prefixed with `['campaigns', ...]` so every mutation
 * invalidates the whole namespace with one call. All actions are
 * non-optimistic (refetch after success).
 *
 * The collection route is `/api/v1/admin/campaigns/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Campaign types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type CampaignResponse = components['schemas']['CampaignResponse']
export type CampaignListResponse = components['schemas']['CampaignListResponse']
export type CampaignCreate = components['schemas']['CampaignCreate']
export type CampaignUpdate = components['schemas']['CampaignUpdate']
export type CampaignAudience = CampaignResponse['audience']
export type CampaignStatus = CampaignResponse['status']

const CAMPAIGNS_NAMESPACE = ['campaigns'] as const

export interface CampaignListParams {
  page?: number
  pageSize?: number
  status?: CampaignStatus
  audience?: CampaignAudience
  search?: string
}

export function useCampaignsQuery(params: MaybeRefOrGetter<CampaignListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CAMPAIGNS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CampaignListResponse>('/api/v1/admin/campaigns/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          audience: p.audience,
          search: p.search || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/** `POST /api/v1/admin/campaigns/` — create a campaign (422 on schedule rule). */
export function useCreateCampaign() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: CampaignCreate) =>
      apiFetch<CampaignResponse>('/api/v1/admin/campaigns/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CAMPAIGNS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/campaigns/{id}` — edit a campaign (422 on schedule rule). */
export function useUpdateCampaign() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CampaignUpdate }) =>
      apiFetch<CampaignResponse>(`/api/v1/admin/campaigns/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CAMPAIGNS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/campaigns/{id}` — remove a campaign. */
export function useDeleteCampaign() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CAMPAIGNS_NAMESPACE] }),
  })
}
