/**
 * Pinia Colada query/mutation layer for admin shipping (zones / methods / rates).
 *
 * Cache keys are tuples under `['shipping', 'zones'|'methods'|'rates', …]` so a
 * mutation can invalidate either a single sub-namespace (when only one resource
 * type is touched) or the whole `['shipping']` parent (when a cross-resource
 * cascade is possible — deleting a zone CASCADEs its rates, deleting a method
 * CASCADEs its rates too). All actions are non-optimistic (refetch after success).
 *
 * Every authed Colada query gates `enabled: () => import.meta.client` per the
 * project-wide SSR-hydration rule (Colada's cache isn't SSR-serialised, so a
 * server-side fetch hydrates against an empty client cache and crashes with a
 * hydration mismatch). The public storefront quote endpoint goes through
 * `useShippingQuote` (FE PR #114) — that's `useApi` direct, not Colada.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  ShippingMethodCreate,
  ShippingMethodListResponse,
  ShippingMethodResponse,
  ShippingMethodUpdate,
  ShippingRateCreate,
  ShippingRateListResponse,
  ShippingRateResponse,
  ShippingRateUpdate,
  ShippingZoneCreate,
  ShippingZoneDetail,
  ShippingZoneListResponse,
  ShippingZoneUpdate,
} from '#shared/types/api'

const SHIPPING_NAMESPACE = ['shipping'] as const
const ZONES_NAMESPACE = [...SHIPPING_NAMESPACE, 'zones'] as const
const METHODS_NAMESPACE = [...SHIPPING_NAMESPACE, 'methods'] as const
const RATES_NAMESPACE = [...SHIPPING_NAMESPACE, 'rates'] as const

// Currency literal — mirrors the backend's Literal["USD","PLN","EUR"]. Kept
// here (rather than imported from money.ts) so the query layer stays free of
// component-tree imports — both consumers (this file + dialogs) read it from
// the codegen types via the API contract.
export type ShippingCurrency = 'USD' | 'PLN' | 'EUR'

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface ShippingZoneListParams {
  page?: number
  pageSize?: number
}

export function useShippingZonesQuery(params: MaybeRefOrGetter<ShippingZoneListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ZONES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<ShippingZoneListResponse>('/api/v1/admin/shipping/zones', {
        query: { page: p.page ?? 1, page_size: p.pageSize ?? 50 },
      })
    },
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useShippingZoneQuery(id: MaybeRefOrGetter<number | null>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ZONES_NAMESPACE, 'detail', toValue(id)],
    query: () => apiFetch<ShippingZoneDetail>(`/api/v1/admin/shipping/zones/${toValue(id)}`),
    enabled: () => import.meta.client && toValue(id) !== null,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCreateShippingZone() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: ShippingZoneCreate) =>
      apiFetch<ShippingZoneDetail>('/api/v1/admin/shipping/zones', {
        method: 'POST',
        body: input,
      }),
    // Country reassignment can free up a code that previously blocked a rate
    // create, so invalidate the whole shipping namespace.
    onSuccess: () => queryCache.invalidateQueries({ key: [...SHIPPING_NAMESPACE] }),
  })
}

export function useUpdateShippingZone() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: ShippingZoneUpdate }) =>
      apiFetch<ShippingZoneDetail>(`/api/v1/admin/shipping/zones/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...SHIPPING_NAMESPACE] }),
  })
}

export function useDeleteShippingZone() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/shipping/zones/${id}`, { method: 'DELETE' }),
    // Zone delete CASCADEs its rates → invalidate both lists.
    onSuccess: () => queryCache.invalidateQueries({ key: [...SHIPPING_NAMESPACE] }),
  })
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

export interface ShippingMethodListParams {
  page?: number
  pageSize?: number
}

export function useShippingMethodsQuery(params: MaybeRefOrGetter<ShippingMethodListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...METHODS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<ShippingMethodListResponse>('/api/v1/admin/shipping/methods', {
        query: { page: p.page ?? 1, page_size: p.pageSize ?? 50 },
      })
    },
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCreateShippingMethod() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: ShippingMethodCreate) =>
      apiFetch<ShippingMethodResponse>('/api/v1/admin/shipping/methods', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...METHODS_NAMESPACE] }),
  })
}

export function useUpdateShippingMethod() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: ShippingMethodUpdate }) =>
      apiFetch<ShippingMethodResponse>(`/api/v1/admin/shipping/methods/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...METHODS_NAMESPACE] }),
  })
}

export function useDeleteShippingMethod() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/shipping/methods/${id}`, { method: 'DELETE' }),
    // Method delete CASCADEs its rates → invalidate both lists.
    onSuccess: () => queryCache.invalidateQueries({ key: [...SHIPPING_NAMESPACE] }),
  })
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export interface ShippingRateListParams {
  page?: number
  pageSize?: number
  zoneId?: number
  methodId?: number
  currency?: ShippingCurrency
}

export function useShippingRatesQuery(params: MaybeRefOrGetter<ShippingRateListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RATES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<ShippingRateListResponse>('/api/v1/admin/shipping/rates', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 50,
          zone_id: p.zoneId,
          method_id: p.methodId,
          currency: p.currency,
        },
      })
    },
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCreateShippingRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: ShippingRateCreate) =>
      apiFetch<ShippingRateResponse>('/api/v1/admin/shipping/rates', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...RATES_NAMESPACE] }),
  })
}

export function useUpdateShippingRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: ShippingRateUpdate }) =>
      apiFetch<ShippingRateResponse>(`/api/v1/admin/shipping/rates/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...RATES_NAMESPACE] }),
  })
}

export function useDeleteShippingRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/shipping/rates/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...RATES_NAMESPACE] }),
  })
}
