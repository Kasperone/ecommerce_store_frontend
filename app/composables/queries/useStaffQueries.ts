/**
 * Pinia Colada query/mutation layer for the admin staff roster (admin-role
 * users + role / active-state management).
 *
 * Cache keys are prefixed with `['staff', ...]` so the update mutation
 * invalidates the whole namespace with one call. The update is non-optimistic
 * (refetch after success).
 *
 * The collection route is `/api/v1/admin/staff/` (trailing slash — FastAPI 307s
 * the slashless form through the h3 proxy). The item route carries none.
 *
 * Staff types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type StaffResponse = components['schemas']['StaffResponse']
export type StaffListResponse = components['schemas']['StaffListResponse']
export type StaffUpdate = components['schemas']['StaffUpdate']
export type UserRole = components['schemas']['UserRole']

const STAFF_NAMESPACE = ['staff'] as const

export interface StaffListParams {
  page?: number
  pageSize?: number
  search?: string
}

export function useStaffQuery(params: MaybeRefOrGetter<StaffListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...STAFF_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<StaffListResponse>('/api/v1/admin/staff/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
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

/**
 * `PATCH /api/v1/admin/staff/{userId}` — set a user's `role` and/or `is_active`.
 *
 * The backend 400s on self-lockout (demoting/deactivating your own account) and
 * on demoting/deactivating the last active admin; callers surface that message
 * via `<ErrorAlert>` rather than pre-disabling controls.
 */
export function useUpdateStaff() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ userId, patch }: { userId: number, patch: StaffUpdate }) =>
      apiFetch<StaffResponse>(`/api/v1/admin/staff/${userId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...STAFF_NAMESPACE] }),
  })
}
