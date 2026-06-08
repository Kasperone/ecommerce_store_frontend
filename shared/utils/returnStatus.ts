/**
 * Return-request status/reason presentation helpers (Returns/RMA v1).
 *
 * Status flow (backend-enforced; mirrored here for UX gating only):
 * `requested → approved | rejected`, `approved → received`,
 * `received | approved → refunded`. `rejected`/`refunded` are terminal.
 *
 * Centralising the literal lists means a backend enum addition surfaces here
 * as a type error rather than silently drifting in a page-local array.
 */

import type { ReturnReason, ReturnStatus } from '#shared/types/api'

export const RETURN_STATUSES: ReturnStatus[] = [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
]

export const RETURN_REASONS: ReturnReason[] = [
  'defective',
  'wrong_item',
  'not_as_described',
  'no_longer_needed',
  'other',
]

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<ReturnStatus, BadgeColor> = {
  requested: 'primary',
  approved: 'info',
  rejected: 'error',
  received: 'warning',
  refunded: 'success',
}

export function returnStatusColor(status: ReturnStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}

/** Forward transitions the admin UI offers per status (backend re-validates). */
export function returnNextActions(status: ReturnStatus): Array<'approve' | 'reject' | 'receive' | 'refund'> {
  switch (status) {
    case 'requested':
      return ['approve', 'reject']
    case 'approved':
      // Refund is allowed straight from `approved` (ship-back-not-required).
      return ['receive', 'refund']
    case 'received':
      return ['refund']
    default:
      return []
  }
}
