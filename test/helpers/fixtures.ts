import type { CategoryResponse, ProductWithCategory } from '#shared/types/api'

/**
 * Typed fixture factories for specs. Annotating against the generated API types
 * means a backend schema change (new required field) fails typecheck here once,
 * instead of leaving every spec with a silently stale hand-written literal.
 */

export function makeCategory(overrides: Partial<CategoryResponse> = {}): CategoryResponse {
  return {
    id: 1,
    name: 'Books',
    slug: 'books',
    description: null,
    sort_order: 0,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** A plain in-stock, single-variant, non-gift-card product. */
export function makeProduct(overrides: Partial<ProductWithCategory> = {}): ProductWithCategory {
  return {
    id: 1,
    name: 'Widget',
    slug: 'widget',
    description: null,
    sku: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    low_stock_threshold: null,
    is_active: true,
    is_featured: false,
    is_gift_card: false,
    allow_backorder: false,
    has_variants: false,
    condition: 'new',
    category_id: null,
    category: null,
    images: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    in_stock: true,
    ...overrides,
  }
}
