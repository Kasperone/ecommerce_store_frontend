/**
 * Pinia Colada query layer for the admin dashboard.
 *
 * Single read-only query against `GET /api/v1/admin/dashboard/kpis`. Client-only
 * (`enabled: () => import.meta.client`) per the project SSR-hydration rule —
 * Colada's cache isn't serialized across SSR, so a server-run authed query would
 * trigger a hydration mismatch.
 */

import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { DashboardKpis } from '#shared/types/api'

export interface DashboardKpisParams {
  windowDays?: number
}

export function useDashboardKpis(params: MaybeRefOrGetter<DashboardKpisParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => ['dashboard', 'kpis', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<DashboardKpis>('/api/v1/admin/dashboard/kpis', {
        query: { window_days: p.windowDays ?? 30 },
      })
    },
    enabled: () => import.meta.client,
  })
}
