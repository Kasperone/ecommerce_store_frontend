/**
 * Pinia Colada query/mutation layer for admin manual collections.
 *
 * Collections mirror categories (per-locale name/slug/description + SEO meta +
 * hero), MINUS the smart-rules surface (v1 is manual-only — `type`/`rules` are
 * never written from the UI). Cache keys are tuples prefixed with
 * `['collections', ...]` so mutations can invalidate the whole namespace in one
 * call. All mutations are non-optimistic (refetch after success).
 *
 * Membership is a separate ordered set: `setCollectionProducts` PUTs the full
 * `{ product_ids }` array in display order — the backend writes `position` by
 * array index. The member products themselves are read back from the public
 * product list (`GET /products?collection_id=`, ordered by curation position).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  CollectionCreate,
  CollectionHeroAltUpdate,
  CollectionHeroResponse,
  CollectionResponse,
  CollectionUpdate,
  CollectionWithProductCount,
  ProductWithCategory,
} from '#shared/types/api'

const COLLECTIONS_NAMESPACE = ['collections'] as const

export function useCollectionsQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COLLECTIONS_NAMESPACE, 'list'],
    query: () => apiFetch<CollectionWithProductCount[]>('/api/v1/admin/collections/'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCollectionQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COLLECTIONS_NAMESPACE, 'detail', toValue(id) ?? null],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Collection id is required'))
      }
      return apiFetch<CollectionWithProductCount>(`/api/v1/admin/collections/${value}`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/**
 * Member products of a collection, in curation order, via the public product
 * list filtered by `collection_id`. Drives the membership editor's ordered list.
 */
export function useCollectionProductsQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COLLECTIONS_NAMESPACE, 'members', toValue(id) ?? null],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Collection id is required'))
      }
      return apiFetch<ProductWithCategory[]>('/api/v1/products/', {
        query: { collection_id: value, limit: 100 },
      })
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

export function useCreateCollection() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CollectionCreate) =>
      apiFetch<CollectionResponse>('/api/v1/admin/collections/', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

export function useUpdateCollection() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CollectionUpdate }) =>
      apiFetch<CollectionResponse>(`/api/v1/admin/collections/${id}`, {
        method: 'PUT',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

export function useDeleteCollection() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/collections/${id}`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

/**
 * `PUT /api/v1/admin/collections/{id}/products` — replace the whole membership
 * set in display order. `product_ids` is the full ordered list; `[]` clears it.
 */
export function useSetCollectionProducts() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, productIds }: { id: number, productIds: number[] }) =>
      apiFetch<unknown>(`/api/v1/admin/collections/${id}/products`, {
        method: 'PUT',
        body: { product_ids: productIds },
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

/** `POST /api/v1/admin/collections/{id}/hero` — multipart hero upload. */
export function useUploadCollectionHero() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, formData }: { id: number, formData: FormData }) =>
      apiFetch<CollectionHeroResponse>(`/api/v1/admin/collections/${id}/hero`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/collections/{id}/hero` — alt-text only edit. */
export function useUpdateCollectionHeroAlt() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CollectionHeroAltUpdate }) =>
      apiFetch<CollectionHeroResponse>(`/api/v1/admin/collections/${id}/hero`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/collections/{id}/hero` — clear columns + R2 object. */
export function useDeleteCollectionHero() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/collections/${id}/hero`, { method: 'DELETE' }),
    onSettled: () => queryCache.invalidateQueries({ key: [...COLLECTIONS_NAMESPACE] }),
  })
}
