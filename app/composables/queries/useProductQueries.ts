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
  ProductBulkSet,
  ProductBulkUpdateResult,
  ProductCreate,
  ProductResponse,
  ProductUpdate,
  ProductWithCategory,
} from '#shared/types/api'

/**
 * Shape of the import report returned by `POST /admin/products/import`.
 * The backend returns a plain dict (not a Pydantic model), so OpenAPI types it
 * `unknown` — this hand-written interface mirrors the documented contract.
 */
export type ProductImportAction = 'create' | 'update' | 'skip' | 'error'

export interface ProductImportRow {
  row_number: number
  action: ProductImportAction
  product_id: number | null
  errors: string[]
}

export interface ProductImportSummary {
  creates: number
  updates: number
  skips: number
  errors: number
}

export interface ProductImportReport {
  dry_run: boolean
  applied: boolean
  summary: ProductImportSummary
  rows: ProductImportRow[]
}

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
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useProductQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRODUCTS_NAMESPACE, 'detail', toValue(id) ?? null],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Product id is required'))
      }
      return apiFetch<ProductWithCategory>(`/api/v1/products/${value}`)
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
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

/**
 * `POST /api/v1/admin/products/import` — multipart CSV upload.
 *
 * `dryRun=true` validates only (writes nothing); `dryRun=false` applies the
 * batch all-or-nothing. Only a successful apply (`dryRun=false`) invalidates the
 * product list — a dry-run preview must not refetch.
 */
export function useImportProducts() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ file, dryRun }: { file: File, dryRun: boolean }) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<ProductImportReport>('/api/v1/admin/products/import', {
        method: 'POST',
        query: { dry_run: dryRun },
        body: formData,
      })
    },
    onSuccess: (_report, { dryRun }) => {
      if (!dryRun) void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] })
    },
  })
}

/**
 * `PATCH /api/v1/admin/products/bulk` — apply a narrow field set to many products
 * in one transaction. Stock is NOT settable. Invalidates the product list on
 * success so prices / status / threshold refresh.
 */
export function useBulkUpdateProducts() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ productIds, set }: { productIds: number[], set: ProductBulkSet }) =>
      apiFetch<ProductBulkUpdateResult>('/api/v1/admin/products/bulk', {
        method: 'PATCH',
        body: { product_ids: productIds, set },
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE] }),
  })
}
