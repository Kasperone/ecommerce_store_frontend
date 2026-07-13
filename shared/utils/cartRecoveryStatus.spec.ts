import { describe, expect, it } from 'vitest'
import {
  CART_RECOVERY_GENERIC_KEY,
  cartRecoveryErrorKey,
} from './cartRecoveryStatus'

/**
 * Machine-code → i18n-key mapping for the recover endpoint's failure states.
 * The codes are the wire contract (plan §2.2) — the FE must key on them, never
 * on human-readable message strings.
 */

describe('cartRecoveryErrorKey', () => {
  it('maps each machine code to its i18n key', () => {
    expect(cartRecoveryErrorKey('cart_not_found')).toBe('cart.recover.invalid')
    expect(cartRecoveryErrorKey('recovery_link_expired')).toBe('cart.recover.expired')
    expect(cartRecoveryErrorKey('cart_already_ordered')).toBe('cart.recover.alreadyOrdered')
  })

  it('falls back to the generic key for an unknown code', () => {
    expect(cartRecoveryErrorKey('some_new_backend_code')).toBe(CART_RECOVERY_GENERIC_KEY)
    // Human-readable prose must NOT match (codes only on the wire).
    expect(cartRecoveryErrorKey('Cart not found')).toBe(CART_RECOVERY_GENERIC_KEY)
  })

  it('falls back to the generic key when the detail is missing entirely', () => {
    expect(cartRecoveryErrorKey(undefined)).toBe(CART_RECOVERY_GENERIC_KEY)
    expect(cartRecoveryErrorKey(null)).toBe(CART_RECOVERY_GENERIC_KEY)
    expect(cartRecoveryErrorKey('')).toBe(CART_RECOVERY_GENERIC_KEY)
  })

  it('does not treat Object.prototype members as codes (`in` guard hardening)', () => {
    expect(cartRecoveryErrorKey('toString')).toBe(CART_RECOVERY_GENERIC_KEY)
    expect(cartRecoveryErrorKey('constructor')).toBe(CART_RECOVERY_GENERIC_KEY)
  })
})
