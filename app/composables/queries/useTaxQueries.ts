/**
 * Pinia Colada query/mutation layer for the admin tax vocabulary
 * (tax categories + their per-country rates).
 *
 * One namespace `['tax']`: every category carries its rates nested, so a
 * rate mutation invalidates the same list a category mutation does. All
 * mutations are non-optimistic (refetch after success) — the nesting makes
 * an optimistic patch fiddly for little gain on a low-traffic admin surface.
 *
 * The category list doubles as the source for the product form's category
 * picker (labelled with each category's home-country rate).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type {
  TaxCategoryCreate,
  TaxCategoryResponse,
  TaxCategoryUpdate,
  TaxRateCreate,
  TaxRateResponse,
  TaxRateUpdate,
} from '#shared/types/api'

const TAX_NAMESPACE = ['tax'] as const

export function useTaxCategoriesQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...TAX_NAMESPACE, 'categories'],
    query: () => apiFetch<TaxCategoryResponse[]>('/api/v1/admin/tax/categories'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCreateTaxCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: TaxCategoryCreate) =>
      apiFetch<TaxCategoryResponse>('/api/v1/admin/tax/categories', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}

export function useUpdateTaxCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: TaxCategoryUpdate }) =>
      apiFetch<TaxCategoryResponse>(`/api/v1/admin/tax/categories/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}

export function useDeleteTaxCategory() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/tax/categories/${id}`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}

export function useCreateTaxRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ categoryId, input }: { categoryId: number, input: TaxRateCreate }) =>
      apiFetch<TaxRateResponse>(`/api/v1/admin/tax/categories/${categoryId}/rates`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}

export function useUpdateTaxRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: TaxRateUpdate }) =>
      apiFetch<TaxRateResponse>(`/api/v1/admin/tax/rates/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}

export function useDeleteTaxRate() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/tax/rates/${id}`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...TAX_NAMESPACE] }),
  })
}
