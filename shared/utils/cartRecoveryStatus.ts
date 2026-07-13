/**
 * Abandoned-cart recovery — error-code → i18n-key mapping.
 *
 * The recover endpoint (`GET /api/v1/carts/recover/{token}`) returns
 * machine-readable snake_case codes in `detail` (plan §2.2; the draft-orders
 * FE #292 lesson — never string-match human prose on the wire):
 *
 * - 404 `cart_not_found`        → unknown/malformed token
 * - 410 `recovery_link_expired` → recovery email older than the token TTL
 * - 410 `cart_already_ordered`  → owner placed an order after the cart snapshot
 *
 * Anything else (429, network, unexpected body) falls back to the generic key.
 * Lifted to a helper per the status-literals house rule (components.md #88).
 */

export type CartRecoveryErrorCode
  = | 'cart_not_found'
    | 'recovery_link_expired'
    | 'cart_already_ordered'

const CODE_TO_KEY: Record<CartRecoveryErrorCode, string> = {
  cart_not_found: 'cart.recover.invalid',
  recovery_link_expired: 'cart.recover.expired',
  cart_already_ordered: 'cart.recover.alreadyOrdered',
}

/** The generic-failure key returned for any unrecognised/absent code. */
export const CART_RECOVERY_GENERIC_KEY = 'cart.recover.error'

/**
 * Map a recover-failure `detail` code to its i18n message key, falling back
 * to the generic error key for unknown codes (or a missing detail entirely).
 */
export function cartRecoveryErrorKey(detail: string | null | undefined): string {
  // Object.hasOwn (not `in`): a hostile/odd detail like "toString" must not
  // resolve through the prototype chain.
  if (detail && Object.hasOwn(CODE_TO_KEY, detail)) {
    return CODE_TO_KEY[detail as CartRecoveryErrorCode]
  }
  return CART_RECOVERY_GENERIC_KEY
}
