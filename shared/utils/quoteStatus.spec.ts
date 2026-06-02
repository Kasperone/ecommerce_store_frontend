import { describe, expect, it } from 'vitest'
import { QUOTE_STATUSES, quoteStatusColor } from './quoteStatus'
import type { QuoteStatus } from './quoteStatus'

describe('quoteStatus helper', () => {
  it('includes the customer-request `requested` status in the vocabulary', () => {
    expect(QUOTE_STATUSES).toContain('requested')
    expect(QUOTE_STATUSES).toContain('accepted')
  })

  it('covers the full backend status set', () => {
    expect(new Set(QUOTE_STATUSES)).toEqual(
      new Set<QuoteStatus>(['draft', 'requested', 'sent', 'accepted', 'rejected', 'expired']),
    )
  })

  it('maps a colour for every status (no undefined fallthrough)', () => {
    for (const status of QUOTE_STATUSES) {
      expect(quoteStatusColor(status)).toBeTruthy()
    }
  })

  it('gives `requested` a distinct colour', () => {
    expect(quoteStatusColor('requested')).toBe('primary')
    expect(quoteStatusColor('accepted')).toBe('success')
  })
})
