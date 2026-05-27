import { describe, expect, it } from 'vitest'
import { buildSearchQuery } from './useCatalog'
import type { SearchParams } from './useCatalog'

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    q: 'phone',
    locale: 'en',
    currency: 'USD',
    ...overrides,
  }
}

describe('buildSearchQuery', () => {
  it('passes through q, locale, and currency', () => {
    const q = buildSearchQuery(params({ q: 'słuchawki', locale: 'pl', currency: 'PLN' }))
    expect(q.q).toBe('słuchawki')
    expect(q.locale).toBe('pl')
    expect(q.currency).toBe('PLN')
  })

  it('defaults to relevance sort and page 1', () => {
    const q = buildSearchQuery(params())
    expect(q.sort).toBe('relevance')
    expect(q.page).toBe(1)
    expect(q.page_size).toBeGreaterThan(0)
  })

  it('maps UI sort keys to the backend sort literals', () => {
    expect(buildSearchQuery(params({ sort: 'priceAsc' })).sort).toBe('price_asc')
    expect(buildSearchQuery(params({ sort: 'priceDesc' })).sort).toBe('price_desc')
    expect(buildSearchQuery(params({ sort: 'nameAsc' })).sort).toBe('name')
  })

  it('only sends in_stock when the shopper opts in', () => {
    expect(buildSearchQuery(params({ inStock: false })).in_stock).toBeUndefined()
    expect(buildSearchQuery(params({ inStock: true })).in_stock).toBe(true)
  })

  it('forwards category + price-range filters', () => {
    const q = buildSearchQuery(params({ categoryId: 3, minPrice: 10, maxPrice: 99 }))
    expect(q.category_id).toBe(3)
    expect(q.min_price).toBe(10)
    expect(q.max_price).toBe(99)
  })
})
