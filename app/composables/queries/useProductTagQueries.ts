/**
 * Pinia Colada query/mutation layer for the product-tag vocabulary.
 *
 * These are PRODUCT tags — a separate vocabulary from the customer tags handled
 * by `useTagQueries.ts`. They live under `/api/v1/admin/product-tags/` and are
 * keyed in the `['product-tags']` Colada namespace so mutations invalidate the
 * whole namespace with one call.
 *
 * Tag *assignment* to a product is not a dedicated endpoint here: the product
 * write (`ProductCreate`/`ProductUpdate`) carries a free-form `tags: string[]`
 * that the backend get-or-creates and reconciles. So a rename/recolor/delete in
 * the vocabulary also reflects on every product — those invalidate `['products']`
 * too. All actions are non-optimistic.
 *
 * The list route carries a trailing slash (FastAPI 307s the slashless form
 * through the h3 proxy); the `{id}` routes carry none.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type {
  ProductTagCreate,
  ProductTagResponse,
  ProductTagUpdate,
} from '#shared/types/api'

const PRODUCT_TAGS_NAMESPACE = ['product-tags'] as const
const PRODUCTS_NAMESPACE = ['products'] as const

/** `GET /api/v1/admin/product-tags/` — vocabulary list with usage counts. */
export function useProductTagsQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRODUCT_TAGS_NAMESPACE, 'list'],
    query: () => apiFetch<ProductTagResponse[]>('/api/v1/admin/product-tags/'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `POST /api/v1/admin/product-tags/` — create a vocabulary tag. */
export function useCreateProductTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: ProductTagCreate) =>
      apiFetch<ProductTagResponse>('/api/v1/admin/product-tags/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRODUCT_TAGS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/product-tags/{id}` — rename / recolor (reflects on every product). */
export function useUpdateProductTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: ProductTagUpdate }) =>
      apiFetch<ProductTagResponse>(`/api/v1/admin/product-tags/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...PRODUCT_TAGS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] })
    },
  })
}

/** `DELETE /api/v1/admin/product-tags/{id}` — remove from the vocabulary + every product. */
export function useDeleteProductTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/product-tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...PRODUCT_TAGS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] })
    },
  })
}
