/**
 * Pinia Colada query/mutation layer for admin categories.
 *
 * Cache keys are tuples prefixed with `['categories', ...]` so mutations
 * can invalidate the whole namespace with one call. Create and update are
 * non-optimistic (refetch after success); delete is optimistic — the row
 * disappears immediately and is restored from the snapshot on error.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  CategoryCreate,
  CategoryDeletePreview,
  CategoryHeroAltUpdate,
  CategoryHeroResponse,
  CategoryResponse,
  CategoryTreeNode,
  CategoryUpdate,
  CategoryWithProductCount,
} from '#shared/types/api'

export type CategoryDeleteMode = 'cascade' | 'reparent_to_root'

export interface BulkReorderInput {
  items: Array<{ id: number, parent_id?: number | null, sort_order: number }>
}

export interface CategoryListParams {
  isActive?: boolean
  skip?: number
  limit?: number
}

const CATEGORIES_NAMESPACE = ['categories'] as const

export function useCategoriesQuery(params: MaybeRefOrGetter<CategoryListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CATEGORIES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CategoryWithProductCount[]>('/api/v1/categories/', {
        query: {
          is_active: p.isActive,
          skip: p.skip ?? 0,
          limit: p.limit ?? 100,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

export function useCategoryQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CATEGORIES_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Category id is required'))
      }
      return apiFetch<CategoryWithProductCount>(`/api/v1/categories/${value}`)
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

export function useCreateCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CategoryCreate) =>
      apiFetch<CategoryResponse>('/api/v1/categories/', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

export function useUpdateCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CategoryUpdate }) =>
      apiFetch<CategoryResponse>(`/api/v1/categories/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

export function useDeleteCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/categories/${id}`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

/**
 * Full category tree via `GET /api/v1/categories/tree`.
 *
 * Each node carries the active product count directly attached to it
 * (descendants are NOT summed). Sibling order is `(sort_order, id)` from
 * the backend.
 */
export function useCategoryTreeQuery(
  params: MaybeRefOrGetter<{ isActive?: boolean }> = {},
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CATEGORIES_NAMESPACE, 'tree', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CategoryTreeNode[]>('/api/v1/categories/tree', {
        query: {
          is_active: p.isActive,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/**
 * `GET /api/v1/categories/{id}/delete-preview` — counts the admin needs
 * before picking cascade vs reparent_to_root in the confirm dialog.
 */
export function useCategoryDeletePreviewQuery(
  id: MaybeRefOrGetter<number | undefined>,
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CATEGORIES_NAMESPACE, 'delete-preview', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Category id is required'))
      }
      return apiFetch<CategoryDeletePreview>(
        `/api/v1/categories/${value}/delete-preview`,
      )
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `POST /api/v1/categories/bulk-reorder` — whole-tree reorder mutation.
 *
 * The backend validates depth + cycle constraints across the full proposed
 * layout, so partial-tree payloads are still safe. Returns the freshly
 * computed tree (also invalidated locally so dependent queries re-fetch).
 */
export function useBulkReorderCategories() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: BulkReorderInput) =>
      apiFetch<CategoryTreeNode[]>('/api/v1/categories/bulk-reorder', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

/**
 * `DELETE /api/v1/categories/{id}?mode=...` — variant that passes the
 * cascade-or-reparent mode as a query param. Plain delete keeps using
 * :func:`useDeleteCategory` (no mode param).
 */
export function useDeleteCategoryWithMode() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, mode }: { id: number, mode: CategoryDeleteMode }) =>
      apiFetch<unknown>(`/api/v1/categories/${id}`, {
        method: 'DELETE',
        query: { mode },
      }),
    onSettled: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/categories/{id}/hero` — multipart upload.
 *
 * The page orchestrates the create-then-upload flow, including the
 * compensating DELETE on failure. This hook is the transport only.
 */
export function useUploadCategoryHero() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, formData }: { id: number, formData: FormData }) =>
      apiFetch<CategoryHeroResponse>(`/api/v1/categories/${id}/hero`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/categories/{id}/hero` — alt-text only edit.
 */
export function useUpdateCategoryHeroAlt() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CategoryHeroAltUpdate }) =>
      apiFetch<CategoryHeroResponse>(`/api/v1/categories/${id}/hero`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}

/**
 * `DELETE /api/v1/categories/{id}/hero` — clear columns + R2 object.
 */
export function useDeleteCategoryHero() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/categories/${id}/hero`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...CATEGORIES_NAMESPACE] }),
  })
}
