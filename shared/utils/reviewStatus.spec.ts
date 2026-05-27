import { describe, expect, it } from 'vitest'
import { REVIEW_STATUSES, reviewStatusColor } from './reviewStatus'

describe('reviewStatusColor', () => {
  it('maps each moderation status to a badge colour', () => {
    expect(reviewStatusColor('pending')).toBe('warning')
    expect(reviewStatusColor('approved')).toBe('success')
    expect(reviewStatusColor('rejected')).toBe('error')
  })

  it('falls back to neutral for an unknown status', () => {
    expect(reviewStatusColor('archived')).toBe('neutral')
  })
})

describe('REVIEW_STATUSES', () => {
  it('lists the three moderation states', () => {
    expect(REVIEW_STATUSES).toEqual(['pending', 'approved', 'rejected'])
  })
})
