import { describe, expect, it } from 'vitest'
import { tStub } from '../../test/helpers/i18nStub'
import { createProductCreateSchema, createProductUpdateSchema } from './product'

const create = createProductCreateSchema(tStub)
const update = createProductUpdateSchema(tStub)

const validProduct = {
  name: 'Encyclopedia',
  slug: 'encyclopedia',
  description: 'A reference work',
  sku: 'ENCY-001',
  price_usd: 19.99,
  price_pln: 79.99,
  price_eur: 17.99,
  stock: 12,
  is_active: true,
  is_featured: false,
  category_id: 1,
}

describe('createProductCreateSchema', () => {
  it('accepts a valid product', () => {
    expect(create.safeParse(validProduct).success).toBe(true)
  })

  it('defaults stock to 0, is_active to true, is_featured to false', () => {
    const result = create.safeParse({
      name: 'Encyclopedia',
      slug: 'encyclopedia',
      price_usd: 19.99,
      price_pln: 79.99,
      price_eur: 17.99,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.stock).toBe(0)
      expect(result.data.is_active).toBe(true)
      expect(result.data.is_featured).toBe(false)
    }
  })

  it('rejects an empty name', () => {
    expect(create.safeParse({ ...validProduct, name: '' }).success).toBe(false)
  })

  it('rejects a name over 200 chars', () => {
    expect(create.safeParse({ ...validProduct, name: 'x'.repeat(201) }).success).toBe(false)
  })

  it('rejects a slug with uppercase characters', () => {
    expect(create.safeParse({ ...validProduct, slug: 'Encyclopedia' }).success).toBe(false)
  })

  it('rejects a slug with spaces', () => {
    expect(create.safeParse({ ...validProduct, slug: 'great encyclopedia' }).success).toBe(false)
  })

  it('rejects a slug starting with a hyphen', () => {
    expect(create.safeParse({ ...validProduct, slug: '-encyclopedia' }).success).toBe(false)
  })

  it('rejects price_usd of zero', () => {
    expect(create.safeParse({ ...validProduct, price_usd: 0 }).success).toBe(false)
  })

  it('rejects a negative price', () => {
    expect(create.safeParse({ ...validProduct, price_pln: -10 }).success).toBe(false)
  })

  it('rejects more than two decimal places on price', () => {
    expect(create.safeParse({ ...validProduct, price_eur: 9.999 }).success).toBe(false)
  })

  it('rejects negative stock', () => {
    expect(create.safeParse({ ...validProduct, stock: -1 }).success).toBe(false)
  })

  it('rejects non-integer stock', () => {
    expect(create.safeParse({ ...validProduct, stock: 1.5 }).success).toBe(false)
  })

  it('accepts a null description and sku', () => {
    expect(create.safeParse({ ...validProduct, description: null, sku: null }).success).toBe(true)
  })

  it('accepts a null category_id', () => {
    expect(create.safeParse({ ...validProduct, category_id: null }).success).toBe(true)
  })

  it('rejects an sku over 100 chars', () => {
    expect(create.safeParse({ ...validProduct, sku: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('createProductUpdateSchema', () => {
  it('accepts an empty patch object', () => {
    expect(update.safeParse({}).success).toBe(true)
  })

  it('accepts partial updates', () => {
    expect(update.safeParse({ name: 'New name' }).success).toBe(true)
    expect(update.safeParse({ price_usd: 21.5 }).success).toBe(true)
    expect(update.safeParse({ stock: 0 }).success).toBe(true)
    expect(update.safeParse({ is_featured: true }).success).toBe(true)
  })

  it('still enforces slug format when present', () => {
    expect(update.safeParse({ slug: 'INVALID' }).success).toBe(false)
  })

  it('still enforces price > 0 when present', () => {
    expect(update.safeParse({ price_pln: 0 }).success).toBe(false)
  })

  it('still enforces non-negative stock when present', () => {
    expect(update.safeParse({ stock: -5 }).success).toBe(false)
  })
})
