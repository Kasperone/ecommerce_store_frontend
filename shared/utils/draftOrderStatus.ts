/**
 * Draft-order presentation helpers (admin-composed orders).
 *
 * Centralises the status literal list (a backend enum addition surfaces here
 * as a type error rather than silently drifting in a page-local array), the
 * badge colours, and the convert-error → i18n-reason mapping.
 *
 * The convert route surfaces its machine `reason` codes as fixed `detail`
 * message strings (`DraftOrderNotConvertibleError.message` — the route maps
 * `detail=exc.message`). `draftConvertReason` recognises the fixed messages so
 * the UI can render a translated, actionable hint; dynamic messages
 * (variant/stock/shipping-rate specifics) return `null` and are shown
 * verbatim.
 */

import type { components } from '#shared/types/api.gen'

export type DraftOrderStatus = components['schemas']['DraftOrderResponse']['status']

export const DRAFT_ORDER_STATUSES: DraftOrderStatus[] = ['open', 'completed']

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<DraftOrderStatus, BadgeColor> = {
  open: 'info',
  completed: 'success',
}

export function draftOrderStatusColor(status: DraftOrderStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}

/** Machine reason codes the convert endpoint can fail with (fixed-message subset). */
export type DraftConvertReason
  = | 'already_converted'
    | 'no_items'
    | 'stale_line'
    | 'no_owner'
    | 'missing_address'
    | 'missing_shipping_method'
    | 'unsupported_method'

// Exact backend messages (app/crud/draft_order.py) → machine reason. The
// remaining reasons (variant_unavailable / shipping_unavailable / stock)
// carry dynamic, self-explanatory messages and are surfaced verbatim.
const MESSAGE_TO_REASON: Record<string, DraftConvertReason> = {
  'draft order already converted': 'already_converted',
  'cannot convert a draft order with no line items': 'no_items',
  'a line references a deleted product; remove it before converting': 'stale_line',
  'set a customer or a guest email before converting': 'no_owner',
  'set a complete shipping address before converting': 'missing_address',
  'set a shipping method before converting': 'missing_shipping_method',
}

/**
 * Map a convert-failure `detail` message to its machine reason, or `null`
 * when the message is dynamic (show it verbatim instead).
 */
export function draftConvertReason(detail: string): DraftConvertReason | null {
  const exact = MESSAGE_TO_REASON[detail.trim()]
  if (exact) return exact
  // The InPost message carries a parenthetical suffix — match on the prefix.
  if (detail.startsWith('InPost locker methods are not supported')) {
    return 'unsupported_method'
  }
  return null
}
