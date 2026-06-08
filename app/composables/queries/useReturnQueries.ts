/**
 * Pinia Colada query/mutation layer for Returns/RMA v1.
 *
 * Cache keys are tuples prefixed with `['returns', ...]` so mutations
 * invalidate the whole namespace with one call. The refund-from-return
 * mutation ALSO invalidates `['orders']` — issuing the refund flips the
 * order's status/refunds, so both the customer and admin order-detail
 * surfaces must refetch.
 *
 * Trailing slashes: the admin collection route is `/api/v1/admin/returns/`
 * (FastAPI 307s the slashless form, which the h3 proxy turns into a broken
 * redirect). Item + nested order routes carry no trailing slash.
 *
 * All queries are client-only (`enabled: () => import.meta.client`) per the
 * project SSR-hydration rule: Colada's cache isn't serialized across SSR, so
 * a server-run authed query would throw a hydration mismatch on hard load.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  ReturnEligibilityResponse,
  ReturnRefundRequest,
  ReturnRequestCreate,
  ReturnRequestListResponse,
  ReturnRequestResponse,
  ReturnStatus,
} from '#shared/types/api'

const RETURNS_NAMESPACE = ['returns'] as const
const ORDERS_NAMESPACE = ['orders'] as const

export interface AdminReturnListParams {
  page?: number
  pageSize?: number
  status?: ReturnStatus
}

export type ReturnTransitionAction = 'approve' | 'reject' | 'receive'

/**
 * `GET /api/v1/orders/{order_id}/returns/eligibility` — the single server-side
 * source for the customer return modal (eligible flag + per-line returnable qty).
 */
export function useReturnEligibilityQuery(orderId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RETURNS_NAMESPACE, 'eligibility', toValue(orderId)],
    query: () => {
      const value = toValue(orderId)
      if (value === undefined) {
        return Promise.reject(new Error('Order id is required'))
      }
      return apiFetch<ReturnEligibilityResponse>(`/api/v1/orders/${value}/returns/eligibility`)
    },
    enabled: () => import.meta.client && toValue(orderId) !== undefined,
  })
}

/**
 * `GET /api/v1/orders/{order_id}/returns` — scoped list (customer sees own,
 * admin sees any). The customer surface NEVER renders `admin_note`.
 */
export function useOrderReturnsQuery(orderId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RETURNS_NAMESPACE, 'order', toValue(orderId)],
    query: () => {
      const value = toValue(orderId)
      if (value === undefined) {
        return Promise.reject(new Error('Order id is required'))
      }
      return apiFetch<ReturnRequestResponse[]>(`/api/v1/orders/${value}/returns`)
    },
    enabled: () => import.meta.client && toValue(orderId) !== undefined,
  })
}

/**
 * `POST /api/v1/orders/{order_id}/returns` — customer return request (201).
 * 400 on eligibility/qty violations; 404 when the order isn't the caller's.
 */
export function useCreateReturnRequest() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ orderId, request }: { orderId: number, request: ReturnRequestCreate }) =>
      apiFetch<ReturnRequestResponse>(`/api/v1/orders/${orderId}/returns`, {
        method: 'POST',
        body: request,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...RETURNS_NAMESPACE] }),
  })
}

/** `GET /api/v1/admin/returns/` — paginated admin list with status filter. */
export function useAdminReturnsQuery(params: MaybeRefOrGetter<AdminReturnListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RETURNS_NAMESPACE, 'admin', 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<ReturnRequestListResponse>('/api/v1/admin/returns/', {
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

/** `GET /api/v1/admin/returns/{id}` — admin detail (lines + order summary). */
export function useAdminReturnQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RETURNS_NAMESPACE, 'admin', 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Return id is required'))
      }
      return apiFetch<ReturnRequestResponse>(`/api/v1/admin/returns/${value}`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `POST /api/v1/admin/returns/{id}/approve|reject|receive` — guarded status
 * transitions with an optional internal `admin_note`. 400 on illegal moves.
 */
export function useReturnTransition() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, action, adminNote }: {
      id: number
      action: ReturnTransitionAction
      adminNote?: string | null
    }) =>
      apiFetch<ReturnRequestResponse>(`/api/v1/admin/returns/${id}/${action}`, {
        method: 'POST',
        body: { admin_note: adminNote ?? null },
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...RETURNS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/returns/{id}/refund` — issue the refund for a return
 * (terminal `refunded`). Amount defaults server-side to the returned-line
 * total when omitted; `restock` writes the inventory movements at refund time.
 * Invalidates BOTH the returns and orders namespaces — the refund flips the
 * order's status/refunds too.
 */
export function useReturnRefund() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, refund }: { id: number, refund: ReturnRefundRequest }) =>
      apiFetch<ReturnRequestResponse>(`/api/v1/admin/returns/${id}/refund`, {
        method: 'POST',
        body: refund,
      }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...RETURNS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] })
    },
  })
}
