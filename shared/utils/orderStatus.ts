/**
 * Order-status presentation + transition helpers (frontend mirror of the
 * backend `_STATUS_TRANSITIONS` map in `app/crud/order.py`).
 *
 * The backend is the source of truth and re-validates every transition; this
 * is purely for UX — driving the admin status dropdown and badge colours so we
 * don't offer transitions the API would reject.
 */

import type { OrderStatus } from '#shared/types/api'

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'partially_refunded',
  'cancelled',
  'refunded',
]

// Forward-only workflow. Terminal/stock-affecting states (cancelled, refunded,
// partially_refunded) are reached through the cancel/refund endpoints, not the
// status dropdown. `partially_refunded → refunded` only goes through the refund
// endpoint too.
const FORWARD_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'processing'],
  paid: ['processing', 'shipped'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  partially_refunded: [],
  cancelled: [],
  refunded: [],
}

// D4: partially_refunded is NOT cancellable — once any refund issues, the only
// forward path is another refund (which may bring the cumulative total to
// order.total → REFUNDED). Cancel would lose the refund-history attribution.
const CANCELLABLE: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped']

// Mirrors the backend `REFUNDABLE_STATUSES` set in `app/crud/refund.py`.
// `partially_refunded` is in here because another refund may bring the
// cumulative total to `order.total` → status flips to REFUNDED. Pending,
// cancelled, and (fully) refunded are NOT refundable.
const REFUNDABLE: OrderStatus[] = [
  'paid', 'processing', 'shipped', 'delivered', 'partially_refunded',
]

/** Statuses an admin may move an order to next (excludes the current one). */
export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return FORWARD_TRANSITIONS[current] ?? []
}

/** Whether an order in this status can still be cancelled (admin). */
export function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE.includes(status)
}

/** Whether an admin may issue a refund against an order in this status. */
export function isRefundable(status: OrderStatus): boolean {
  return REFUNDABLE.includes(status)
}

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<OrderStatus, BadgeColor> = {
  pending: 'warning',
  paid: 'info',
  processing: 'info',
  shipped: 'primary',
  delivered: 'success',
  // `warning` chosen to sit between `paid` (info) and `refunded` (neutral) —
  // the customer's badge reads as "paid, but some money came back".
  partially_refunded: 'warning',
  cancelled: 'error',
  refunded: 'neutral',
}

export function statusColor(status: OrderStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}
