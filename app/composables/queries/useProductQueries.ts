/**
 * Pinia Colada query/mutation layer for admin products.
 *
 * Cache keys are tuples prefixed with `['products', ...]` so mutations
 * can invalidate the whole namespace with one call. Create and update are
 * non-optimistic (refetch after success); delete is optimistic via the
 * caller's local snapshot+rollback — same pattern as categories.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  ProductCreate,
  ProductResponse,
  ProductUpdate,
  ProductWithCategory,
} from '#shared/types/api'

export interface ProductListParams {
  page?: number
  pageSize?: number
  categoryId?: number
  isActive?: boolean
  isFeatured?: boolean
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  search?: string
}

export interface ProductListPage {
  items: ProductWithCategory[]
  total: number
  page: number
  page_size: number
  pages: number
}

const PRODUCTS_NAMESPACE = ['products'] as const

export function useProductsQuery(params: MaybeRefOrGetter<ProductListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRODUCTS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      // Trailing slash matches FastAPI's `@router.post("/")` route. Without it,
      // POSTs hit a 307 that the Nuxt nitro proxy refuses to follow (RFC-correct
      // for POST) and surfaces as a 502 Bad Gateway from the proxy.
      return apiFetch<ProductListPage>('/api/v1/products/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          category_id: p.categoryId,
          is_active: p.isActive,
          is_featured: p.isFeatured,
          min_price: p.minPrice,
          max_price: p.maxPrice,
          in_stock: p.inStock,
          search: p.search,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

export function useProductQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRODUCTS_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Product id is required'))
      }
      return apiFetch<ProductWithCategory>(`/api/v1/products/${value}`)
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

export function useCreateProduct() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: ProductCreate) =>
      apiFetch<ProductResponse>('/api/v1/products/', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] }),
  })
}

export function useUpdateProduct() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: ProductUpdate }) =>
      apiFetch<ProductResponse>(`/api/v1/products/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] }),
  })
}

export function useDeleteProduct() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/products/${id}`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] }),
  })
}
