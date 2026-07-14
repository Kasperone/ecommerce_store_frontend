/**
 * Gift-card + store-credit presentation helpers (admin surfaces).
 *
 * Centralises the status literal list (a backend enum addition surfaces here
 * as a type error rather than silently drifting in a page-local array), the
 * badge colours, the masked-code rendering, and the machine-code → i18n-key
 * mapping for the signed adjust endpoints.
 *
 * The adjust routes surface their machine codes directly in `detail`
 * (`GiftCardError.code` / `StoreCreditError.code` — the routes map
 * `detail=exc.code`), so clients match on the fixed code strings, never on
 * prose.
 */

import type { components } from '#shared/types/api.gen'

// GiftCardResponse.status is a plain string on the wire; the PATCH body's
// literal union is the authoritative list of statuses the backend accepts.
export type GiftCardStatus = NonNullable<components['schemas']['GiftCardUpdate']['status']>

export const GIFT_CARD_STATUSES: GiftCardStatus[] = ['active', 'disabled']

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<GiftCardStatus, BadgeColor> = {
  active: 'success',
  disabled: 'neutral',
}

export function giftCardStatusColor(status: string): BadgeColor {
  return STATUS_COLORS[status as GiftCardStatus] ?? 'neutral'
}

/** Render the stored last4 as a masked code, e.g. `•••• 7QK2`. */
export function maskGiftCardCode(last4: string): string {
  return `•••• ${last4}`
}

/**
 * A card past its optional `expires_at` still carries status `active` — the
 * backend only refuses it at redemption time (`gift_card_expired`). Derive the
 * expired hint client-side so the admin list/detail can badge it.
 */
export function isGiftCardExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false
  const d = new Date(expiresAt)
  return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime()
}

/** Machine codes the signed adjust endpoints can 400 with (in `detail`). */
export const GIFT_CARD_BALANCE_NEGATIVE = 'gift_card_balance_negative'
export const STORE_CREDIT_BALANCE_NEGATIVE = 'store_credit_balance_negative'

const ADJUST_ERROR_KEYS: Record<string, string> = {
  [GIFT_CARD_BALANCE_NEGATIVE]: 'admin.giftCards.errors.balanceNegative',
  [STORE_CREDIT_BALANCE_NEGATIVE]: 'admin.customers.storeCredit.errors.balanceNegative',
}

/**
 * Map an adjust-failure `detail` machine code to its i18n key, or `null` when
 * the message is not a known code (show the backend message verbatim instead).
 */
export function adjustErrorKey(detail: string | null | undefined): string | null {
  if (!detail) return null
  return ADJUST_ERROR_KEYS[detail.trim()] ?? null
}
