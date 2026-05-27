import { describe, expect, it } from 'vitest'
import { createReviewSchema } from './review'

// Mirrors the calling convention t('key', { default: 'English copy' }).
const t = ((_key: string, opts?: { default?: string }) => opts?.default ?? _key) as never

const schema = createReviewSchema(t)

describe('createReviewSchema', () => {
  it('accepts a valid review', () => {
    const r = schema.safeParse({ rating: 5, title: 'Great', body: 'Works really well.' })
    expect(r.success).toBe(true)
  })

  it('accepts an omitted title', () => {
    const r = schema.safeParse({ rating: 4, body: 'Solid enough for me.' })
    expect(r.success).toBe(true)
  })

  it('rejects rating 0 (no selection) and out-of-range', () => {
    expect(schema.safeParse({ rating: 0, body: 'Long enough body.' }).success).toBe(false)
    expect(schema.safeParse({ rating: 6, body: 'Long enough body.' }).success).toBe(false)
  })

  it('rejects a body shorter than 10 chars', () => {
    expect(schema.safeParse({ rating: 5, body: 'too short' }).success).toBe(false)
  })

  it('rejects a title longer than 200 chars', () => {
    const r = schema.safeParse({ rating: 5, title: 'x'.repeat(201), body: 'A valid review body.' })
    expect(r.success).toBe(false)
  })
})
