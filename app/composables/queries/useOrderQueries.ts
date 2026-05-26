/**
 * Pinia Colada query/mutation layer for admin orders.
 *
 * Cache keys are tuples prefixed with `['orders', ...]` so mutations invalidate
 * the whole namespace with one call. Status update and cancel are
 * non-optimistic (refetch after success).
 *
 * Trailing slashes: the collection route is `/api/v1/orders/` (FastAPI 307s the
 * slashless form, which the h3 proxy turns into a broken redirect). Item routes
 * (`/{id}`, `/{id}/cancel`) carry no trailing slash.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  OrderCreate,
  OrderListResponse,
  OrderResponse,
  OrderStatus,
  OrderUpdate,
  OrderWithUser,
} from '#shared/types/api'

export interface OrderListParams {
  page?: number
  pageSize?: number
  status?: OrderStatus
}

const ORDERS_NAMESPACE = ['orders'] as const

// Orders are private/authed (no SEO) and our Pinia Colada plugin doesn't
// serialize its cache across SSR. If a query runs on the server it renders real
// content into the SSR HTML, but the client hydrates with an empty cache and
// re-renders the loading state → a hydration mismatch on any hard load. Gating
// `enabled` to the client keeps these queries client-only: the server and the
// client's first render both show the loading state, so they agree, and the
// fetch happens once (client) instead of being wasted on the server too. This
// matches the project's "@pinia/colada is client-only; useAsyncData for SSR/SEO"
// split — these pages deliberately do not need server-rendered content.
export function useOrdersQuery(params: MaybeRefOrGetter<OrderListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ORDERS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<OrderListResponse>('/api/v1/orders/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
        },
      })
    },
    enabled: () => import.meta.client,
  })
}

export function useOrderQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ORDERS_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Order id is required'))
      }
      return apiFetch<OrderWithUser>(`/api/v1/orders/${value}`)
    },
    // Client-only (+ id present) — see useOrdersQuery above for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `POST /api/v1/orders/` — customer checkout. Creates a `pending` order from the
 * cart (the backend validates stock, snapshots products, and computes pricing).
 * 422 on unavailable/insufficient-stock lines. Trailing slash is required.
 */
export function useCreateOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: OrderCreate) =>
      apiFetch<OrderResponse>('/api/v1/orders/', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/orders/{id}` — admin status workflow + notes/payment fields.
 */
export function useUpdateOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: OrderUpdate }) =>
      apiFetch<OrderWithUser>(`/api/v1/orders/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/orders/{id}/cancel` — restores stock and sets status=cancelled.
 */
export function useCancelOrder() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<OrderResponse>(`/api/v1/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] }),
  })
}
