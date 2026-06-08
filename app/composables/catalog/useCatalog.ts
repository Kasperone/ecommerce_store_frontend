/**
 * Storefront catalog data layer.
 *
 * Unlike the admin `@pinia/colada` queries (client-only — no Nuxt SSR module is
 * wired), the public catalog is SEO-critical, so it fetches via Nuxt's native
 * `useAsyncData` + `useApi().apiFetch`: server-rendered, payload-hydrated (no
 * double fetch), and feeds `useSeoMeta`. All endpoints are public — `useApi`
 * simply sends no bearer token.
 */

import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { API_ENDPOINTS, buildApiUrl } from '#shared/constants/api'
import type {
  CategoryTreeNode,
  CategoryWithProductCount,
  CollectionWithProductCount,
  LowestPriceResponse,
  ProductResponse,
  ProductWithCategory,
  PublicReviewListResponse,
  SearchResponse,
} from '#shared/types/api'
import type { CurrencyCode } from '#shared/utils/money'

export type CatalogSort = 'newest' | 'priceAsc' | 'priceDesc' | 'nameAsc'

export interface StorefrontListParams {
  page?: number
  categoryId?: number
  // Manual-collection membership filter (ordered by curation position server-side).
  collectionId?: number
  // Product-tag filter (by tag name) — drives the PDP chip → /products?tag= links.
  tag?: string
  search?: string
  inStock?: boolean
  sort?: CatalogSort
}

export interface StorefrontProductPage {
  items: ProductWithCategory[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const STOREFRONT_PAGE_SIZE = 12

// UI sort key → backend (sort_by, order). Mirrors the params added in backend #51.
const SORT_MAP: Record<CatalogSort, { sort_by: string, order: string }> = {
  newest: { sort_by: 'created_at', order: 'desc' },
  priceAsc: { sort_by: 'price_usd', order: 'asc' },
  priceDesc: { sort_by: 'price_usd', order: 'desc' },
  nameAsc: { sort_by: 'name', order: 'asc' },
}

export function buildListQuery(p: StorefrontListParams) {
  const sort = SORT_MAP[p.sort ?? 'newest']
  return {
    page: p.page ?? 1,
    page_size: STOREFRONT_PAGE_SIZE,
    category_id: p.categoryId,
    // When set, the backend joins on `collection_products` and orders by the
    // curated `position` — sort_by/order below are ignored for collection reads.
    collection_id: p.collectionId,
    // Free-form tag-name filter (join on product_tag_links → product_tags).
    tag: p.tag || undefined,
    // Only narrow when the shopper opts in; never request out-of-stock-only.
    in_stock: p.inStock ? true : undefined,
    search: p.search,
    is_active: true,
    sort_by: sort.sort_by,
    order: sort.order,
  }
}

/**
 * Paginated, filtered product list. Refetches when `params` changes.
 *
 * `key` is parameterized so distinct surfaces (the main catalog page vs a
 * category landing page) don't share a `useAsyncData` cache entry.
 */
export function useProductListing(
  params: MaybeRefOrGetter<StorefrontListParams>,
  key = 'storefront-products',
) {
  const { apiFetch } = useApi()
  return useAsyncData(
    key,
    () => apiFetch<StorefrontProductPage>('/api/v1/products/', { query: buildListQuery(toValue(params)) }),
    { watch: [() => toValue(params)] },
  )
}

/** Single product by slug (with category + images). */
export function useProductDetail(slug: string) {
  const { apiFetch } = useApi()
  return useAsyncData(
    `storefront-product-${slug}`,
    () => apiFetch<ProductWithCategory>(`/api/v1/products/slug/${encodeURIComponent(slug)}`),
  )
}

/**
 * OMNIBUS (Directive 98/6 Art. 6a) — lowest price for ``productId`` in
 * ``currency`` over the last 30 days.
 *
 * SSR-fetched so the legal comparison line is in the crawlable HTML alongside
 * the price (the PDP must show this transparently — see the storefront PDP
 * + ``<ShopOmnibusPrice>``). Refetches when the active currency changes.
 *
 * The backend returns ``lowest_price = null`` + ``since = null`` when no
 * history exists (impossible for products created via the route chokepoint +
 * the migration backfill, but possible for legacy edge cases). The display
 * component renders nothing in that case.
 *
 * The composable is also used by the admin product form to render the
 * "Lowest 30d: X.XX since DATE" decision-support hint next to each price input.
 */
export function useProductLowest30d(
  productId: number,
  currency: MaybeRefOrGetter<string>,
  // OMNIBUS is per-offer: a variant price cut needs its own 30-day-low trail
  // (variants F2, plan risk 7). null/undefined → product-grain rows (today's
  // behavior, and the PDP default until the shopper resolves the option pills).
  variantId: MaybeRefOrGetter<number | null | undefined> = null,
) {
  const { apiFetch } = useApi()
  return useAsyncData(
    `storefront-product-${productId}-lowest30d-${toValue(currency)}`,
    () =>
      apiFetch<LowestPriceResponse>(`/api/v1/products/${productId}/lowest-30d`, {
        query: { currency: toValue(currency), variant_id: toValue(variantId) ?? undefined },
      }),
    { watch: [() => toValue(currency), () => toValue(variantId)] },
  )
}

export type ReviewSort = 'newest' | 'helpful'

/**
 * Public (approved-only) reviews + rating summary for a product, paginated.
 * SSR-fetched so reviews are crawlable and feed the PDP. Refetches on page or
 * sort change. `sortBy` is whitelisted by the backend (`newest` | `helpful`).
 */
export function useProductReviews(
  productId: number,
  page: MaybeRefOrGetter<number> = 1,
  pageSize = 10,
  sortBy: MaybeRefOrGetter<ReviewSort> = 'newest',
) {
  const { apiFetch } = useApi()
  return useAsyncData(
    `storefront-product-reviews-${productId}`,
    () =>
      apiFetch<PublicReviewListResponse>(`/api/v1/products/${productId}/reviews`, {
        query: { page: toValue(page), page_size: pageSize, sort_by: toValue(sortBy) },
      }),
    { watch: [() => toValue(page), () => toValue(sortBy)] },
  )
}

/** Featured products for the home page. */
export function useFeaturedProducts(limit = 8) {
  const { apiFetch } = useApi()
  return useAsyncData(
    'storefront-featured',
    () => apiFetch<ProductResponse[]>('/api/v1/products/featured', { query: { limit } }),
  )
}

/** Single category by slug (EN or PL slug resolves server-side). */
export function useCategoryDetail(slug: string) {
  const { apiFetch } = useApi()
  return useAsyncData(
    `storefront-category-${slug}`,
    () => apiFetch<CategoryWithProductCount>(`/api/v1/categories/slug/${encodeURIComponent(slug)}`),
  )
}

/**
 * Active manual collections (storefront `/collections` landing).
 *
 * SSR-fetched like the rest of the public catalog so the grid is crawlable and
 * payload-hydrated. The backend returns only active collections with member
 * product counts.
 */
export function useCollectionsListPublic() {
  const { apiFetch } = useApi()
  return useAsyncData(
    'storefront-collections',
    () => apiFetch<CollectionWithProductCount[]>(API_ENDPOINTS.COLLECTIONS.PUBLIC_LIST),
  )
}

/** Single collection by slug (EN or PL slug resolves server-side; 404 on miss/inactive). */
export function useCollectionDetail(slug: string) {
  const { apiFetch } = useApi()
  return useAsyncData(
    `storefront-collection-${slug}`,
    () =>
      apiFetch<CollectionWithProductCount>(
        buildApiUrl.collectionBySlug(encodeURIComponent(slug)),
      ),
  )
}

/** Active category tree (for nav + the catalog category filter). */
export function useStorefrontCategories() {
  const { apiFetch } = useApi()
  return useAsyncData(
    'storefront-categories',
    () => apiFetch<CategoryTreeNode[]>('/api/v1/categories/tree', { query: { is_active: true } }),
  )
}

// ---------------------------------------------------------------------------
// Faceted search (Meilisearch via the backend `/api/v1/search` endpoint).
// ---------------------------------------------------------------------------

export type SearchSort = 'relevance' | 'priceAsc' | 'priceDesc' | 'nameAsc'

export interface SearchParams {
  q: string
  locale: string
  currency: CurrencyCode
  categoryId?: number
  // Collection slug + tag name facet filters (P2).
  collection?: string
  tag?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  sort?: SearchSort
  page?: number
}

// UI sort key → backend `sort` Literal (relevance | price_asc | price_desc | name).
const SEARCH_SORT_MAP: Record<SearchSort, string> = {
  relevance: 'relevance',
  priceAsc: 'price_asc',
  priceDesc: 'price_desc',
  nameAsc: 'name',
}

export function buildSearchQuery(p: SearchParams) {
  return {
    q: p.q,
    locale: p.locale,
    currency: p.currency,
    category_id: p.categoryId,
    collection: p.collection || undefined,
    tag: p.tag || undefined,
    min_price: p.minPrice,
    max_price: p.maxPrice,
    // Only narrow when the shopper opts in; never request out-of-stock-only.
    in_stock: p.inStock ? true : undefined,
    sort: SEARCH_SORT_MAP[p.sort ?? 'relevance'],
    page: p.page ?? 1,
    page_size: STOREFRONT_PAGE_SIZE,
  }
}

/**
 * Faceted product search. SSR-fetched (SEO-friendly, like the catalog), refetches
 * when `params` changes. The shopper's currency drives the price facet/sort field;
 * `locale` selects the localized name/description returned by the backend.
 */
export function useSearchResults(params: MaybeRefOrGetter<SearchParams>) {
  const { apiFetch } = useApi()
  return useAsyncData(
    'storefront-search',
    () => apiFetch<SearchResponse>(API_ENDPOINTS.SEARCH.QUERY, {
      query: buildSearchQuery(toValue(params)),
    }),
    { watch: [() => toValue(params)] },
  )
}
