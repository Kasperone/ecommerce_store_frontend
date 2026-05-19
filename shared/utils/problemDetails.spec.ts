import { describe, expect, it } from 'vitest'
import { parseProblem } from './problemDetails'

describe('parseProblem', () => {
  it('returns null for nullish input', () => {
    expect(parseProblem(null)).toBeNull()
    expect(parseProblem(undefined)).toBeNull()
  })

  it('lifts FastAPI detail onto title for the default HTTPException shape', () => {
    const err = { data: { detail: 'Category with this slug already exists' }, status: 400 }
    const result = parseProblem(err)
    expect(result).toMatchObject({
      title: 'Category with this slug already exists',
      detail: 'Category with this slug already exists',
      status: 400,
    })
  })

  it('prefers RFC 7807 title when present', () => {
    const err = {
      data: {
        type: 'about:blank',
        title: 'Slug taken',
        detail: 'Category with this slug already exists',
        status: 400,
      },
    }
    const result = parseProblem(err)
    expect(result?.title).toBe('Slug taken')
    expect(result?.detail).toBe('Category with this slug already exists')
  })

  it('extracts per-field errors when populated', () => {
    const err = {
      data: {
        title: 'Validation failed',
        errors: { slug: ['Already taken'], name: ['Too short'] },
      },
    }
    expect(parseProblem(err)?.errors).toEqual({
      slug: ['Already taken'],
      name: ['Too short'],
    })
  })

  it('coerces string-valued errors into one-element arrays', () => {
    const err = { data: { title: 'Bad', errors: { slug: 'Already taken' } } }
    expect(parseProblem(err)?.errors).toEqual({ slug: ['Already taken'] })
  })

  it('returns null errors when none present so callers can skip-render', () => {
    expect(parseProblem({ data: { title: 'Bad' } })?.errors).toBeUndefined()
  })

  it('falls back to Error.message', () => {
    expect(parseProblem(new Error('boom'))?.title).toBe('boom')
  })

  it('falls back to a generic title when Error.message is empty', () => {
    expect(parseProblem(new Error(''))?.title).toBe('Request failed')
  })

  it('accepts a plain string', () => {
    expect(parseProblem('something went wrong')?.title).toBe('something went wrong')
  })

  it('reads status off the error envelope when missing on body', () => {
    const err = { status: 503, data: { detail: 'Unavailable' } }
    expect(parseProblem(err)?.status).toBe(503)
  })
})
