/**
 * Quote-status presentation helpers (B2B quotes).
 *
 * The backend allows any → any status transition in the MVP (see `QuoteUpdate`
 * docstring), so unlike orders there's no forward-only transition map — the
 * status dropdown offers the full set. This module just centralises the status
 * literal list (so a backend enum addition surfaces here as a type error rather
 * than silently drifting in a page-local array) and the badge colours.
 */

import type { components } from '#shared/types/api.gen'

export type QuoteStatus = components['schemas']['QuoteResponse']['status']

export const QUOTE_STATUSES: QuoteStatus[] = [
  'draft',
  'requested',
  'sent',
  'accepted',
  'rejected',
  'expired',
]

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<QuoteStatus, BadgeColor> = {
  draft: 'neutral',
  requested: 'primary',
  sent: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
}

export function quoteStatusColor(status: QuoteStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}
