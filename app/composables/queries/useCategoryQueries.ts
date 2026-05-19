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
  CategoryResponse,
  CategoryUpdate,
  CategoryWithProductCount,
} from '#shared/types/api'

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
      return apiFetch<CategoryWithProductCount[]>('/api/v1/categories', {
        query: {
          is_active: p.isActive,
          skip: p.skip ?? 0,
          limit: p.limit ?? 100,
        },
      })
    },
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
    enabled: () => toValue(id) !== undefined,
  })
}

export function useCreateCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CategoryCreate) =>
      apiFetch<CategoryResponse>('/api/v1/categories', {
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
