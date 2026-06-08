/**
 * Pinia Colada query for the PDP "You may also like" / related-products rail.
 *
 * Backed by the public, unauthenticated related-products route:
 *   - `GET /api/v1/products/{slug}/related?limit=<1..24>` → `ProductResponse[]`
 *
 * The payload is the exact product-card shape the storefront listing/search
 * grids render, so the consuming section reuses `<ShopProductCard>` unchanged.
 *
 * Client-only (`enabled: () => import.meta.client`) — Pinia Colada doesn't
 * serialize its cache across SSR, so a server-run query would throw a hydration
 * mismatch on a hard load (rule #87). The rail sits below the fold anyway, so a
 * client fetch is fine. Keyed `['products','related', slug]` so it caches per
 * product and is naturally scoped under the `products` namespace.
 */

import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ProductResponse } from '#shared/types/api'

const RELATED_NAMESPACE = ['products', 'related'] as const

export function useRelatedProductsQuery(
  slug: MaybeRefOrGetter<string | undefined>,
  limit = 8,
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...RELATED_NAMESPACE, toValue(slug) ?? ''],
    query: () => {
      const value = toValue(slug)
      if (!value) {
        return Promise.resolve<ProductResponse[]>([])
      }
      return apiFetch<ProductResponse[]>(
        `/api/v1/products/${encodeURIComponent(value)}/related`,
        { query: { limit } },
      )
    },
    // Client-only (+ slug present): avoids an SSR hydration mismatch (Colada
    // isn't SSR-serialized) and skips a guaranteed-empty fetch with no slug.
    enabled: () => import.meta.client && !!toValue(slug),
    // The "also bought" signal shifts slowly; keep it cached for the session.
    staleTime: 1000 * 60 * 5,
  })
}
