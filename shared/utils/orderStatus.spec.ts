import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUSES,
  isCancellable,
  isRefundable,
  nextStatuses,
  statusColor,
} from './orderStatus'

describe('nextStatuses', () => {
  it('offers the forward workflow only', () => {
    expect(nextStatuses('pending')).toEqual(['paid', 'processing'])
    expect(nextStatuses('paid')).toEqual(['processing', 'shipped'])
    expect(nextStatuses('processing')).toEqual(['shipped'])
    expect(nextStatuses('shipped')).toEqual(['delivered'])
  })

  it('never offers cancelled or refunded variants as a forward target', () => {
    for (const s of ORDER_STATUSES) {
      expect(nextStatuses(s)).not.toContain('cancelled')
      expect(nextStatuses(s)).not.toContain('refunded')
      expect(nextStatuses(s)).not.toContain('partially_refunded')
    }
  })

  it('returns nothing for terminal states', () => {
    expect(nextStatuses('delivered')).toEqual([])
    expect(nextStatuses('cancelled')).toEqual([])
    expect(nextStatuses('refunded')).toEqual([])
    // v2: partially_refunded is also terminal from the admin PATCH POV — the
    // only forward path is another refund via POST /orders/{id}/refunds.
    expect(nextStatuses('partially_refunded')).toEqual([])
  })
})

describe('isCancellable', () => {
  it('allows cancelling open orders', () => {
    expect(isCancellable('pending')).toBe(true)
    expect(isCancellable('paid')).toBe(true)
    expect(isCancellable('processing')).toBe(true)
    expect(isCancellable('shipped')).toBe(true)
  })

  it('rejects cancelling terminal orders', () => {
    expect(isCancellable('delivered')).toBe(false)
    expect(isCancellable('cancelled')).toBe(false)
    expect(isCancellable('refunded')).toBe(false)
    // D4: partially_refunded is NOT cancellable — once a refund issues, cancel
    // would lose the refund-history attribution.
    expect(isCancellable('partially_refunded')).toBe(false)
  })
})

describe('isRefundable', () => {
  it('allows refunding paid + fulfilment-track statuses', () => {
    expect(isRefundable('paid')).toBe(true)
    expect(isRefundable('processing')).toBe(true)
    expect(isRefundable('shipped')).toBe(true)
    expect(isRefundable('delivered')).toBe(true)
  })

  it('still allows refunding a partially_refunded order — another refund may close the cumulative gap to REFUNDED', () => {
    // Regression for the live-verify bug: the admin "Issue refund" button
    // disappeared once an order hit `partially_refunded` because the page-local
    // REFUNDABLE list omitted that status. Mirrors the BE REFUNDABLE_STATUSES
    // set, which DOES include PARTIALLY_REFUNDED so another partial can finish
    // the refund.
    expect(isRefundable('partially_refunded')).toBe(true)
  })

  it('rejects refunding orders in non-refundable statuses', () => {
    expect(isRefundable('pending')).toBe(false)
    expect(isRefundable('cancelled')).toBe(false)
    expect(isRefundable('refunded')).toBe(false)
  })
})

describe('statusColor', () => {
  it('maps every status to a colour', () => {
    for (const s of ORDER_STATUSES) {
      expect(typeof statusColor(s)).toBe('string')
    }
    expect(statusColor('delivered')).toBe('success')
    expect(statusColor('cancelled')).toBe('error')
    // v2: partially_refunded sits between paid (info) and refunded (neutral).
    expect(statusColor('partially_refunded')).toBe('warning')
  })
})
