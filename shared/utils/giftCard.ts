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

/**
 * Machine codes the public gift-card check endpoint (`POST /gift-cards/check`)
 * fails with — mapped to storefront copy. 404 `gift_card_not_found`; 409
 * `gift_card_disabled` / `gift_card_expired` / `gift_card_depleted` /
 * `gift_card_currency_mismatch` / `gift_cards_disabled` (toggle off). The same
 * codes surface at order create if a card is depleted between check and submit.
 */
const CHECK_ERROR_KEYS: Record<string, string> = {
  gift_card_not_found: 'checkout.giftCard.errors.notFound',
  gift_card_disabled: 'checkout.giftCard.errors.disabled',
  gift_card_expired: 'checkout.giftCard.errors.expired',
  gift_card_depleted: 'checkout.giftCard.errors.depleted',
  gift_card_currency_mismatch: 'checkout.giftCard.errors.currencyMismatch',
  gift_cards_disabled: 'checkout.giftCard.errors.featureDisabled',
}

/**
 * Resolve a gift-card check/redeem failure to an i18n key. A 429 carries prose
 * (not a machine code), so it's keyed off `status` first; otherwise the machine
 * code in `detail` is matched, falling back to a generic message so a buyer
 * never sees a raw backend string or an untranslated code.
 */
export function giftCardCheckErrorKey(
  detail: string | null | undefined,
  status?: number,
): string {
  if (status === 429) return 'checkout.giftCard.errors.rateLimited'
  const code = detail?.trim()
  if (code && code in CHECK_ERROR_KEYS) return CHECK_ERROR_KEYS[code]!
  return 'checkout.giftCard.errors.generic'
}

/**
 * Amount a stored-value tender covers against a running total: never more than
 * the balance, never more than what's left to pay (a negative cap → 0). Mirrors
 * the backend's `min(balance, remainder)` allocation (D10).
 */
export function tenderCoverage(balance: number, remaining: number): number {
  return Math.max(0, Math.min(balance, Math.max(0, remaining)))
}

// Store-credit ledger entry kinds (backend enum: adjust|redeem|release|refund)
// → i18n keys for the customer's own ledger table. Lifted here per the
// status-literal rule (a backend enum addition surfaces as a lookup miss).
const STORE_CREDIT_KIND_KEYS: Record<string, string> = {
  adjust: 'account.storeCredit.kinds.adjust',
  redeem: 'account.storeCredit.kinds.redeem',
  release: 'account.storeCredit.kinds.release',
  refund: 'account.storeCredit.kinds.refund',
}

/** Map a store-credit ledger `kind` to its i18n key (unknown → the raw kind). */
export function storeCreditKindKey(kind: string): string {
  return STORE_CREDIT_KIND_KEYS[kind] ?? kind
}
