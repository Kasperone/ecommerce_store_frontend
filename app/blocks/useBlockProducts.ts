/**
 * Product-source resolver for the product grid/carousel blocks.
 *
 * A block declares a `source` (featured | bestsellers | new | collection |
 * manual) + a `limit` (+ `collection_slug` / `product_ids`). This resolves it to
 * a concrete product list via `useAsyncData` (SSR-safe, stable key) so the block
 * markup is server-rendered and crawlable. Empty/failed fetches resolve to `[]`
 * so a block never crashes the page.
 *
 * Endpoint notes (backend constraints):
 * - `featured` → `GET /products/featured`.
 * - `new`      → `GET /products/?sort_by=created_at&order=desc`.
 * - `bestsellers` → no dedicated endpoint yet; falls back to `featured`.
 * - `collection` → `GET /products/?category_id=<resolved-from-slug>`.
 * - `manual`   → fetch a page then filter/order by `product_ids` client-side
 *   (no `ids` filter exists on the list endpoint).
 */
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ProductResponse } from '#shared/types/api'
import type { components } from '#shared/types/api.gen'

type ProductListResponse = components['schemas']['ProductListResponse']

export type BlockProductSource = 'featured' | 'bestsellers' | 'new' | 'collection' | 'manual'

export interface BlockProductsParams {
  source: BlockProductSource
  limit: number
  collectionSlug?: string | null
  productIds?: number[] | null
}

/** A stable, content-derived key so SSR + client resolve the same cache entry. */
function paramsKey(p: BlockProductsParams): string {
  return [
    p.source,
    p.limit,
    p.collectionSlug ?? '',
    (p.productIds ?? []).join('.'),
  ].join('|')
}

export function useBlockProducts(
  params: MaybeRefOrGetter<BlockProductsParams>,
  keyPrefix: string,
) {
  const { apiFetch } = useApi()

  return useAsyncData<ProductResponse[]>(
    () => `${keyPrefix}-${paramsKey(toValue(params))}`,
    async () => {
      const p = toValue(params)
      try {
        return await resolveProducts(apiFetch, p)
      }
      catch {
        // A data block degrades to empty rather than blanking the page.
        return []
      }
    },
    {
      default: () => [],
      watch: [() => paramsKey(toValue(params))],
    },
  )
}

type ApiFetch = ReturnType<typeof useApi>['apiFetch']

async function resolveProducts(
  apiFetch: ApiFetch,
  p: BlockProductsParams,
): Promise<ProductResponse[]> {
  const limit = Math.max(1, Math.min(p.limit ?? 8, 48))

  if (p.source === 'featured' || p.source === 'bestsellers') {
    const items = await apiFetch<ProductResponse[]>('/api/v1/products/featured', {
      query: { limit },
    })
    return (items ?? []).slice(0, limit)
  }

  if (p.source === 'manual') {
    const ids = (p.productIds ?? []).filter(id => typeof id === 'number')
    if (!ids.length) return []
    // No `ids` filter on the list endpoint — fetch a generous page and order to
    // match the admin-chosen `product_ids` sequence.
    const page = await apiFetch<ProductListResponse>('/api/v1/products/', {
      query: { is_active: true, page: 1, page_size: 48 },
    })
    const byId = new Map((page?.items ?? []).map(item => [item.id, item]))
    return ids
      .map(id => byId.get(id))
      .filter((item): item is ProductResponse => item != null)
      .slice(0, limit)
  }

  // `new` (sorted newest) or `collection` (filtered by resolved category id).
  let categoryId: number | undefined
  if (p.source === 'collection' && p.collectionSlug) {
    categoryId = await resolveCategoryId(apiFetch, p.collectionSlug)
    if (categoryId == null) return []
  }

  const page = await apiFetch<ProductListResponse>('/api/v1/products/', {
    query: {
      is_active: true,
      page: 1,
      page_size: limit,
      category_id: categoryId,
      sort_by: 'created_at',
      order: 'desc',
    },
  })
  return page?.items ?? []
}

async function resolveCategoryId(
  apiFetch: ApiFetch,
  slug: string,
): Promise<number | undefined> {
  try {
    const cat = await apiFetch<{ id: number }>(
      `/api/v1/categories/slug/${encodeURIComponent(slug)}`,
    )
    return cat?.id
  }
  catch {
    return undefined
  }
}
