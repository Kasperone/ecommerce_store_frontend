import { describe, expect, it } from 'vitest'
import {
  RETURN_REASONS,
  RETURN_STATUSES,
  returnNextActions,
  returnStatusColor,
} from './returnStatus'

describe('returnStatusColor', () => {
  it('maps every status to a badge color', () => {
    for (const status of RETURN_STATUSES) {
      expect(returnStatusColor(status)).toBeTruthy()
    }
  })

  it('flags terminal-bad as error and terminal-good as success', () => {
    expect(returnStatusColor('rejected')).toBe('error')
    expect(returnStatusColor('refunded')).toBe('success')
  })
})

describe('returnNextActions', () => {
  it('offers approve/reject from requested', () => {
    expect(returnNextActions('requested')).toEqual(['approve', 'reject'])
  })

  it('offers receive + refund from approved (ship-back-not-required path)', () => {
    expect(returnNextActions('approved')).toEqual(['receive', 'refund'])
  })

  it('offers refund from received', () => {
    expect(returnNextActions('received')).toEqual(['refund'])
  })

  it('offers nothing from terminal statuses', () => {
    expect(returnNextActions('rejected')).toEqual([])
    expect(returnNextActions('refunded')).toEqual([])
  })
})

describe('literal lists', () => {
  it('covers the five statuses and five reasons', () => {
    expect(RETURN_STATUSES).toHaveLength(5)
    expect(RETURN_REASONS).toHaveLength(5)
    expect(RETURN_REASONS).toContain('not_as_described')
  })
})
