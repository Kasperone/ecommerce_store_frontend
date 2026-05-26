import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES, isCancellable, nextStatuses, statusColor } from './orderStatus'

describe('nextStatuses', () => {
  it('offers the forward workflow only', () => {
    expect(nextStatuses('pending')).toEqual(['paid', 'processing'])
    expect(nextStatuses('paid')).toEqual(['processing', 'shipped'])
    expect(nextStatuses('processing')).toEqual(['shipped'])
    expect(nextStatuses('shipped')).toEqual(['delivered'])
  })

  it('never offers cancelled or refunded as a forward target', () => {
    for (const s of ORDER_STATUSES) {
      expect(nextStatuses(s)).not.toContain('cancelled')
      expect(nextStatuses(s)).not.toContain('refunded')
    }
  })

  it('returns nothing for terminal states', () => {
    expect(nextStatuses('delivered')).toEqual([])
    expect(nextStatuses('cancelled')).toEqual([])
    expect(nextStatuses('refunded')).toEqual([])
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
  })
})

describe('statusColor', () => {
  it('maps every status to a colour', () => {
    for (const s of ORDER_STATUSES) {
      expect(typeof statusColor(s)).toBe('string')
    }
    expect(statusColor('delivered')).toBe('success')
    expect(statusColor('cancelled')).toBe('error')
  })
})
