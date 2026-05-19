import { describe, expect, it } from 'vitest'
import { tStub } from '../../test/helpers/i18nStub'
import { createCategoryCreateSchema, createCategoryUpdateSchema } from './category'

const create = createCategoryCreateSchema(tStub)
const update = createCategoryUpdateSchema(tStub)

describe('createCategoryCreateSchema', () => {
  it('accepts a valid category', () => {
    const result = create.safeParse({
      name: 'Books',
      slug: 'books',
      description: 'Printed reads',
      is_active: true,
    })
    expect(result.success).toBe(true)
  })

  it('defaults is_active to true', () => {
    const result = create.safeParse({ name: 'Books', slug: 'books' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_active).toBe(true)
    }
  })

  it('rejects an empty name', () => {
    const result = create.safeParse({ name: '', slug: 'books' })
    expect(result.success).toBe(false)
  })

  it('rejects a slug with uppercase characters', () => {
    const result = create.safeParse({ name: 'Books', slug: 'Books' })
    expect(result.success).toBe(false)
  })

  it('rejects a slug with spaces', () => {
    const result = create.safeParse({ name: 'Books', slug: 'books and stationery' })
    expect(result.success).toBe(false)
  })

  it('rejects a slug starting with a hyphen', () => {
    const result = create.safeParse({ name: 'Books', slug: '-books' })
    expect(result.success).toBe(false)
  })

  it('rejects a description over 500 chars', () => {
    const result = create.safeParse({
      name: 'Books',
      slug: 'books',
      description: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('accepts a null description', () => {
    const result = create.safeParse({ name: 'Books', slug: 'books', description: null })
    expect(result.success).toBe(true)
  })
})

describe('createCategoryUpdateSchema', () => {
  it('accepts an empty patch object', () => {
    const result = update.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial updates', () => {
    expect(update.safeParse({ name: 'Books' }).success).toBe(true)
    expect(update.safeParse({ is_active: false }).success).toBe(true)
    expect(update.safeParse({ slug: 'new-slug' }).success).toBe(true)
  })

  it('still enforces slug format when present', () => {
    expect(update.safeParse({ slug: 'INVALID' }).success).toBe(false)
  })
})
