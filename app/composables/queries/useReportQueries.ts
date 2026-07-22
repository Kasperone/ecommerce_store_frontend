/**
 * Pinia Colada query layer for the admin reports page.
 *
 * Four read-only aggregates over `GET /api/v1/admin/reports/*`:
 *   - sales (over time, zero-filled buckets) — `start`/`end` REQUIRED
 *   - top-products (ranked by units)
 *   - by-category (revenue + units per category)
 *   - refund-summary (per-currency refunded / revenue / rate)
 *
 * All client-only (`enabled: () => import.meta.client`) per the project
 * SSR-hydration rule (#87) — Colada's cache isn't serialized across SSR, so a
 * server-run authed query would trigger a hydration mismatch. The sales query is
 * additionally gated on having both `start` and `end` (the backend 422s without
 * them); the others accept an open range.
 *
 * The report response types are read straight from the generated `api.gen`
 * `components` map: `shared/types/api.ts` (the convenience re-export layer) is
 * hand-rolled and doesn't surface them, and it's not ours to edit.
 */

import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type ReportGranularity = 'day' | 'week' | 'month'

export type SalesReport = components['schemas']['SalesReport']
export type SalesBucket = components['schemas']['SalesBucket']
export type TopProductsReport = components['schemas']['TopProductsReport']
export type TopProductRow = components['schemas']['TopProductRow']
export type CategoryRevenueReport = components['schemas']['CategoryRevenueReport']
export type CategoryRevenueRow = components['schemas']['CategoryRevenueRow']
export type RefundSummary = components['schemas']['RefundSummary']
export type RefundSummaryRow = components['schemas']['RefundSummaryRow']
export type EuDistanceSellingStatus = components['schemas']['EuDistanceSellingStatus']
export type EuThresholdYear = components['schemas']['EuThresholdYear']
export type EuTaxStatus = EuThresholdYear['status']

const REPORTS_NAMESPACE = ['reports'] as const

export interface SalesReportParams {
  start?: string
  end?: string
  granularity?: ReportGranularity
}

export interface RangeParams {
  start?: string
  end?: string
}

export interface TopProductsParams extends RangeParams {
  limit?: number
}

/**
 * `GET /reports/sales` — sales over time. Gated on a complete range: the backend
 * requires `start`+`end`, so we keep the query disabled until both are present.
 */
export function useSalesReport(params: MaybeRefOrGetter<SalesReportParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REPORTS_NAMESPACE, 'sales', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<SalesReport>('/api/v1/admin/reports/sales', {
        query: { start: p.start, end: p.end, granularity: p.granularity ?? 'day' },
      })
    },
    enabled: () => {
      const p = toValue(params)
      return import.meta.client && !!p.start && !!p.end
    },
    // Heavy read-only aggregates; identical filter re-runs within 5min reuse the cache.
    staleTime: 1000 * 60 * 5,
  })
}

/** `GET /reports/top-products` — best-sellers ranked by units over the window. */
export function useTopProductsReport(params: MaybeRefOrGetter<TopProductsParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REPORTS_NAMESPACE, 'top-products', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<TopProductsReport>('/api/v1/admin/reports/top-products', {
        query: { start: p.start, end: p.end, limit: p.limit ?? 10 },
      })
    },
    enabled: () => import.meta.client,
    // Heavy read-only aggregates; identical filter re-runs within 5min reuse the cache.
    staleTime: 1000 * 60 * 5,
  })
}

/** `GET /reports/by-category` — revenue + units per (current) category. */
export function useCategoryRevenueReport(params: MaybeRefOrGetter<RangeParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REPORTS_NAMESPACE, 'by-category', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CategoryRevenueReport>('/api/v1/admin/reports/by-category', {
        query: { start: p.start, end: p.end },
      })
    },
    enabled: () => import.meta.client,
    // Heavy read-only aggregates; identical filter re-runs within 5min reuse the cache.
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * `GET /reports/eu-distance-selling` — EU One-Stop-Shop €10k threshold status for
 * the given year (default current) + the preceding year. Not range-filtered: it's
 * a calendar-year compliance figure, not a windowed aggregate.
 */
export function useEuDistanceSellingStatus(year?: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REPORTS_NAMESPACE, 'eu-distance-selling', toValue(year) ?? 'current'],
    query: () =>
      apiFetch<EuDistanceSellingStatus>('/api/v1/admin/reports/eu-distance-selling', {
        query: { year: toValue(year) },
      }),
    enabled: () => import.meta.client,
    // Threshold moves only as orders land; 5min matches the other report caches.
    staleTime: 1000 * 60 * 5,
  })
}

/** `GET /reports/refund-summary` — per-currency refunded / revenue / rate. */
export function useRefundSummaryReport(params: MaybeRefOrGetter<RangeParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...REPORTS_NAMESPACE, 'refund-summary', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<RefundSummary>('/api/v1/admin/reports/refund-summary', {
        query: { start: p.start, end: p.end },
      })
    },
    enabled: () => import.meta.client,
    // Heavy read-only aggregates; identical filter re-runs within 5min reuse the cache.
    staleTime: 1000 * 60 * 5,
  })
}
