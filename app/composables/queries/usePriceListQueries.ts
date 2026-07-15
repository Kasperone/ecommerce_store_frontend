/**
 * Pinia Colada query/mutation layer for admin B2B price lists (Shopify-gap P2 #14).
 *
 * Cache keys are prefixed with `['priceLists', ...]` so every mutation invalidates
 * the whole namespace with one call. All actions are non-optimistic (refetch after
 * success). Entry mutations also live under the same namespace so editing an entry
 * refetches its parent list detail.
 *
 * The collection route is `/api/v1/admin/price-lists/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item + entry routes carry none.
 *
 * Types come straight from the generated `api.gen.ts` schema map.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type PriceListResponse = components['schemas']['PriceListResponse']
export type PriceListListItem = components['schemas']['PriceListListItem']
export type PriceListListResponse = components['schemas']['PriceListListResponse']
export type PriceListCreate = components['schemas']['PriceListCreate']
export type PriceListUpdate = components['schemas']['PriceListUpdate']
export type PriceListEntryResponse = components['schemas']['PriceListEntryResponse']
export type PriceListEntryCreate = components['schemas']['PriceListEntryCreate']
export type PriceListEntryUpdate = components['schemas']['PriceListEntryUpdate']

const PRICE_LISTS_NAMESPACE = ['priceLists'] as const

export interface PriceListListParams {
  page?: number
  pageSize?: number
  search?: string
}

/** `GET /api/v1/admin/price-lists/` — paginated list rows (entry counts, no entries). */
export function usePriceListsQuery(params: MaybeRefOrGetter<PriceListListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRICE_LISTS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<PriceListListResponse>('/api/v1/admin/price-lists/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          search: p.search || undefined,
        },
      })
    },
    enabled: () => import.meta.client,
    staleTime: 1000 * 60,
  })
}

/** `GET /api/v1/admin/price-lists/{id}` — full list with nested `entries`. */
export function usePriceListQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRICE_LISTS_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Price list id is required'))
      }
      return apiFetch<PriceListResponse>(`/api/v1/admin/price-lists/${value}`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
    staleTime: 1000 * 60,
  })
}

/** `POST /api/v1/admin/price-lists/` — create an empty list (201). */
export function useCreatePriceList() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: PriceListCreate) =>
      apiFetch<PriceListResponse>('/api/v1/admin/price-lists/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/price-lists/{id}` — edit name/active/notes. */
export function useUpdatePriceList() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: PriceListUpdate }) =>
      apiFetch<PriceListResponse>(`/api/v1/admin/price-lists/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/price-lists/{id}` — remove a list (204); assigned companies unassign. */
export function useDeletePriceList() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/price-lists/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/price-lists/{id}/entries` — add a product/variant entry (201).
 * 404 unknown product, 422 foreign variant, 409 duplicate grain (surface `detail`).
 */
export function useAddPriceListEntry() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ listId, body }: { listId: number, body: PriceListEntryCreate }) =>
      apiFetch<PriceListEntryResponse>(`/api/v1/admin/price-lists/${listId}/entries`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/price-lists/{id}/entries/{entryId}` — edit an entry's prices. */
export function useUpdatePriceListEntry() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ listId, entryId, patch }: {
      listId: number
      entryId: number
      patch: PriceListEntryUpdate
    }) =>
      apiFetch<PriceListEntryResponse>(
        `/api/v1/admin/price-lists/${listId}/entries/${entryId}`,
        { method: 'PATCH', body: patch },
      ),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/price-lists/{id}/entries/{entryId}` — remove an entry (204). */
export function useDeletePriceListEntry() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ listId, entryId }: { listId: number, entryId: number }) =>
      apiFetch<unknown>(`/api/v1/admin/price-lists/${listId}/entries/${entryId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRICE_LISTS_NAMESPACE] }),
  })
}
