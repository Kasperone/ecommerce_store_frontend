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
  /** Custom range start, `YYYY-MM-DD`. Sent (with `endDate`) instead of `windowDays`. */
  startDate?: string
  /** Custom range end, `YYYY-MM-DD`. */
  endDate?: string
}

export function useDashboardKpis(params: MaybeRefOrGetter<DashboardKpisParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => ['dashboard', 'kpis', toValue(params)],
    query: () => {
      const p = toValue(params)
      // A complete custom range overrides the trailing-window param.
      const query: Record<string, string | number>
        = p.startDate && p.endDate
          ? { start_date: p.startDate, end_date: p.endDate }
          : { window_days: p.windowDays ?? 30 }
      return apiFetch<DashboardKpis>('/api/v1/admin/dashboard/kpis', { query })
    },
    enabled: () => import.meta.client,
    // KPI aggregates; 60s keeps back-nav snappy while staying fresh on real revisits.
    staleTime: 1000 * 60,
  })
}
