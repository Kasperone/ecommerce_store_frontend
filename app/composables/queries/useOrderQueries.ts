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
  OrderEditRequest,
  OrderListResponse,
  OrderResponse,
  OrderStatus,
  OrderUpdate,
  OrderWithUser,
  RefundCreate,
  RefundResponse,
} from '#shared/types/api'

export interface OrderListParams {
  page?: number
  pageSize?: number
  status?: OrderStatus
  // ISO `YYYY-MM-DD`; bounds `created_at` by UTC calendar day, `dateTo` inclusive.
  dateFrom?: string
  dateTo?: string
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
          date_from: p.dateFrom,
          date_to: p.dateTo,
        },
      })
    },
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
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
 * `PATCH /api/v1/orders/{id}/items` — replace a PENDING order's line set and
 * recompute totals (admin, `orders:write`). Sends the full desired line set +
 * optional manual discount + shipping method. Invalidates the orders namespace
 * and the order's timeline (an `edited` event is written) on success. 409 when
 * the order is not pending; the caller maps that machine state to copy.
 */
export function useEditOrderItems() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ orderId, edit }: { orderId: number, edit: OrderEditRequest }) =>
      apiFetch<OrderWithUser>(`/api/v1/orders/${orderId}/items`, {
        method: 'PATCH',
        body: edit,
      }),
    onSuccess: (_data, { orderId }) => {
      void queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['order-events', orderId] })
    },
  })
}

/**
 * `POST /api/v1/orders/{id}/record-net-terms-payment` — record the bank transfer
 * that settles a B2B pay-on-account order (admin, `orders:write`). Stamps
 * `net_terms_paid_at` and frees the amount against the company's credit limit;
 * fulfilment status is untouched. Invalidates the orders namespace + the
 * company-credit query so the admin credit readout refreshes. Idempotent server-
 * side; 409 (`not_a_net_terms_order`) on a non-net-terms order.
 */
export function useRecordNetTermsPayment() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<OrderWithUser>(`/api/v1/orders/${id}/record-net-terms-payment`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['companies', 'credit'] })
    },
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

/**
 * `POST /api/v1/orders/{id}/refunds` — admin-only refund issuance.
 *
 * v1 ships full-order refunds only — the backend 400s when amount differs from
 * `order.total` (`PartialRefundUnsupported`). `restock=true` writes per-line
 * `order_refunded` inventory movements via the apply_delta choke point. Always
 * issues a faktura korygująca (KOR) when the order has a faktura. Invalidates
 * the whole orders namespace on success so the order detail re-renders with
 * `refunds` populated + the status badge flipped to `refunded`.
 */
export function useIssueRefund() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ orderId, refund }: { orderId: number, refund: RefundCreate }) =>
      apiFetch<RefundResponse>(`/api/v1/orders/${orderId}/refunds`, {
        method: 'POST',
        body: refund,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ORDERS_NAMESPACE] }),
  })
}

/**
 * `GET /api/v1/orders/{id}/refunds` — scoped (customer sees own, admin sees any).
 *
 * Standalone fetcher used by the customer + admin order-detail surfaces; the
 * order detail response also embeds the `refunds` array, so this is only needed
 * when you want to re-read the list independently of the order's other fields.
 * Client-only — same SSR-hydration rationale as `useOrderQuery`.
 */
export function useOrderRefundsQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ORDERS_NAMESPACE, 'refunds', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Order id is required'))
      }
      return apiFetch<RefundResponse[]>(`/api/v1/orders/${value}/refunds`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}
