import { describe, expect, it } from 'vitest'
import {
  GIFT_CARD_BALANCE_NEGATIVE,
  GIFT_CARD_STATUSES,
  STORE_CREDIT_BALANCE_NEGATIVE,
  adjustErrorKey,
  giftCardStatusColor,
  isGiftCardExpired,
  maskGiftCardCode,
} from './giftCard'

describe('giftCardStatusColor', () => {
  it('maps each known status to its badge color', () => {
    expect(GIFT_CARD_STATUSES).toEqual(['active', 'disabled'])
    expect(giftCardStatusColor('active')).toBe('success')
    expect(giftCardStatusColor('disabled')).toBe('neutral')
  })

  it('falls back to neutral for an unknown status', () => {
    expect(giftCardStatusColor('archived')).toBe('neutral')
  })
})

describe('maskGiftCardCode', () => {
  it('renders the stored last4 behind a mask', () => {
    expect(maskGiftCardCode('7QK2')).toBe('•••• 7QK2')
  })
})

describe('isGiftCardExpired', () => {
  const now = new Date('2026-07-14T12:00:00Z')

  it('is false without an expiry (D9: optional expires_at)', () => {
    expect(isGiftCardExpired(null, now)).toBe(false)
    expect(isGiftCardExpired(undefined, now)).toBe(false)
  })

  it('is true strictly after the expiry instant', () => {
    expect(isGiftCardExpired('2026-07-14T11:59:59Z', now)).toBe(true)
    expect(isGiftCardExpired('2026-07-14T12:00:01Z', now)).toBe(false)
  })

  it('is false for an unparseable date', () => {
    expect(isGiftCardExpired('not-a-date', now)).toBe(false)
  })
})

describe('adjustErrorKey', () => {
  it('maps both balance-negative machine codes to their i18n keys', () => {
    expect(adjustErrorKey(GIFT_CARD_BALANCE_NEGATIVE))
      .toBe('admin.giftCards.errors.balanceNegative')
    expect(adjustErrorKey(STORE_CREDIT_BALANCE_NEGATIVE))
      .toBe('admin.customers.storeCredit.errors.balanceNegative')
  })

  it('tolerates surrounding whitespace', () => {
    expect(adjustErrorKey(`  ${GIFT_CARD_BALANCE_NEGATIVE} `))
      .toBe('admin.giftCards.errors.balanceNegative')
  })

  it('returns null for prose details and empty input', () => {
    expect(adjustErrorKey('Gift card not found')).toBeNull()
    expect(adjustErrorKey('')).toBeNull()
    expect(adjustErrorKey(null)).toBeNull()
    expect(adjustErrorKey(undefined)).toBeNull()
  })
})
