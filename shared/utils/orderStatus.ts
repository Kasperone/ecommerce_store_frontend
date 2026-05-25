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
  'cancelled',
  'refunded',
]

// Forward-only workflow. Terminal/stock-affecting states (cancelled, refunded)
// are reached through the cancel endpoint, not the status dropdown.
const FORWARD_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'processing'],
  paid: ['processing', 'shipped'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
}

const CANCELLABLE: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped']

/** Statuses an admin may move an order to next (excludes the current one). */
export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return FORWARD_TRANSITIONS[current] ?? []
}

/** Whether an order in this status can still be cancelled (admin). */
export function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE.includes(status)
}

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<OrderStatus, BadgeColor> = {
  pending: 'warning',
  paid: 'info',
  processing: 'info',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'error',
  refunded: 'neutral',
}

export function statusColor(status: OrderStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}
