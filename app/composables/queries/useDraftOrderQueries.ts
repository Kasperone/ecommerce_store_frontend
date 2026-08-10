/**
 * Pinia Colada query/mutation layer for admin draft orders.
 *
 * Cache keys are prefixed with `['draft-orders', ...]` so every mutation
 * invalidates the whole namespace with one call. All actions are
 * non-optimistic (refetch after success) — the server computes every
 * effective price / line total / subtotal / total, so the response is the
 * only source of truth for money.
 *
 * The collection route is `/api/v1/admin/draft-orders/` (trailing slash —
 * FastAPI 307s the slashless form through the h3 proxy). Item routes carry
 * none. Item mutations return the FULL updated `DraftOrderResponse`.
 *
 * Types come straight from the generated `api.gen.ts` schema map (same
 * pattern as useQuoteQueries).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'
import { API_ENDPOINTS, buildApiUrl } from '#shared/constants/api'

export type DraftOrderResponse = components['schemas']['DraftOrderResponse']
export type DraftOrderListItem = components['schemas']['DraftOrderListItem']
export type DraftOrderListResponse = components['schemas']['DraftOrderListResponse']
export type DraftOrderCreate = components['schemas']['DraftOrderCreate']
export type DraftOrderUpdate = components['schemas']['DraftOrderUpdate']
export type DraftOrderItemCreate = components['schemas']['DraftOrderItemCreate']
export type DraftOrderItemUpdate = components['schemas']['DraftOrderItemUpdate']
export type DraftOrderItemResponse = components['schemas']['DraftOrderItemResponse']
export type DraftOrderConvert = components['schemas']['DraftOrderConvert']
export type DraftOrderStatus = DraftOrderResponse['status']
export type DraftOrderCurrency = DraftOrderCreate['currency']
// Local-only (NOT re-exported): `OrderResponse` is the public auto-import from
// `#shared/types/api`; aliasing it here without `export` keeps the convert
// mutation's return type precise without shadowing that auto-import.
type OrderResponse = components['schemas']['OrderResponse']

const DRAFT_ORDERS_NAMESPACE = ['draft-orders'] as const

export interface DraftOrderListParams {
  page?: number
  pageSize?: number
  status?: DraftOrderStatus
}

// Draft orders are admin-only (no SEO) and the Pinia Colada plugin doesn't
// serialize its cache across SSR. Gating `enabled` to the client keeps these
// queries client-only so the server and the client's first render agree (both
// show the loading state) — see useOrderQueries for the full rationale.
export function useDraftOrdersQuery(params: MaybeRefOrGetter<DraftOrderListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...DRAFT_ORDERS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<DraftOrderListResponse>(API_ENDPOINTS.DRAFT_ORDERS.LIST, {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
        },
      })
    },
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `GET /api/v1/admin/draft-orders/{id}` — full draft with nested `items`. */
export function useDraftOrderQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...DRAFT_ORDERS_NAMESPACE, 'detail', toValue(id) ?? null],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Draft order id is required'))
      }
      return apiFetch<DraftOrderResponse>(buildApiUrl.draftOrderById(value))
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/**
 * `POST /api/v1/admin/draft-orders/` — create an empty draft (201) with a
 * pinned, immutable `currency`. Customer is optional while drafting; an
 * explicit `user_id` must exist (404).
 */
export function useCreateDraftOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: DraftOrderCreate) =>
      apiFetch<DraftOrderResponse>(API_ENDPOINTS.DRAFT_ORDERS.CREATE, { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/admin/draft-orders/{id}` — edit the header (owner, address,
 * shipping method, discount, notes). Only fields sent are applied; an explicit
 * `null` clears a nullable field. 409 on a completed draft.
 */
export function useUpdateDraftOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: DraftOrderUpdate }) =>
      apiFetch<DraftOrderResponse>(buildApiUrl.draftOrderById(id), {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/draft-orders/{id}` — remove an open draft (204; 409 completed). */
export function useDeleteDraftOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(buildApiUrl.draftOrderById(id), { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/draft-orders/{id}/items` — add a catalog line (201).
 * A product with active variants requires `variant_id` (422 otherwise);
 * `unit_price_override` pins the line price, omit for live catalog pricing.
 * Returns the FULL updated draft.
 */
export function useAddDraftOrderItem() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ draftId, body }: { draftId: number, body: DraftOrderItemCreate }) =>
      apiFetch<DraftOrderResponse>(buildApiUrl.draftOrderItems(draftId), {
        method: 'POST',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/admin/draft-orders/{id}/items/{itemId}` — patch a line's
 * `quantity` and/or `unit_price_override` (an explicit `null` clears the pin
 * back to live catalog pricing). Returns the FULL updated draft.
 */
export function useUpdateDraftOrderItem() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ draftId, itemId, patch }: {
      draftId: number
      itemId: number
      patch: DraftOrderItemUpdate
    }) =>
      apiFetch<DraftOrderResponse>(buildApiUrl.draftOrderItemById(draftId, itemId), {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/draft-orders/{id}/items/{itemId}` — remove a line (204). */
export function useRemoveDraftOrderItem() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ draftId, itemId }: { draftId: number, itemId: number }) =>
      apiFetch<unknown>(buildApiUrl.draftOrderItemById(draftId, itemId), { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/draft-orders/{id}/convert` — convert an open draft into
 * a real pending order (201 `OrderResponse`). Eligibility is enforced
 * server-side: 409 when already converted, 422 for every other precondition
 * (no items, stale line, no owner, incomplete address, no shipping method,
 * variant/stock/shipping problems, InPost locker method). The `detail` string
 * is mapped to a human message via `draftConvertErrorKey`. Invalidates both
 * the `['draft-orders']` and `['orders']` namespaces so the completed draft +
 * the new order refetch fresh.
 */
export function useConvertDraftOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: number, body: DraftOrderConvert }) =>
      apiFetch<OrderResponse>(buildApiUrl.draftOrderConvert(id), { method: 'POST', body }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...DRAFT_ORDERS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['orders'] })
    },
  })
}
