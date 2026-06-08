import { describe, expect, it } from 'vitest'
import { buildListQuery, buildSearchQuery } from './useCatalog'
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

  it('forwards the collection + tag facet filters when set', () => {
    const q = buildSearchQuery(params({ collection: 'summer', tag: 'new' }))
    expect(q.collection).toBe('summer')
    expect(q.tag).toBe('new')
  })

  it('omits empty collection/tag (default state)', () => {
    const q = buildSearchQuery(params())
    expect(q.collection).toBeUndefined()
    expect(q.tag).toBeUndefined()
    const empty = buildSearchQuery(params({ collection: '', tag: '' }))
    expect(empty.collection).toBeUndefined()
    expect(empty.tag).toBeUndefined()
  })
})

describe('buildListQuery', () => {
  it('forwards collection_id for collection-membership listings', () => {
    expect(buildListQuery({ collectionId: 12 }).collection_id).toBe(12)
    expect(buildListQuery({}).collection_id).toBeUndefined()
  })

  it('forwards a tag-name filter, omitting empty', () => {
    expect(buildListQuery({ tag: 'sale' }).tag).toBe('sale')
    expect(buildListQuery({ tag: '' }).tag).toBeUndefined()
    expect(buildListQuery({}).tag).toBeUndefined()
  })

  it('always requests active products with a positive page size', () => {
    const q = buildListQuery({ collectionId: 1 })
    expect(q.is_active).toBe(true)
    expect(q.page_size).toBeGreaterThan(0)
  })
})
