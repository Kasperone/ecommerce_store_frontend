/**
 * Pinia Colada query/mutation layer for the customer-tag vocabulary and the
 * customer↔tag assignment.
 *
 * Two namespaces are touched: `['tags']` (the vocabulary + usage counts) and
 * `['customers']` (per-customer chips + detail). A rename/recolor/delete changes
 * how a tag renders on every customer, so those invalidate both; a plain create
 * touches only the vocabulary. All actions are non-optimistic.
 *
 * The vocabulary collection is `/api/v1/admin/tags/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Assignment routes carry none.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type {
  CustomerTagAssign,
  TagChip,
  TagCreate,
  TagResponse,
  TagUpdate,
} from '#shared/types/api'

const TAGS_NAMESPACE = ['tags'] as const
const CUSTOMERS_NAMESPACE = ['customers'] as const

export function useTagsQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...TAGS_NAMESPACE, 'list'],
    query: () => apiFetch<TagResponse[]>('/api/v1/admin/tags/'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/** `POST /api/v1/admin/tags/` — create a vocabulary tag. */
export function useCreateTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: TagCreate) =>
      apiFetch<TagResponse>('/api/v1/admin/tags/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TAGS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/tags/{id}` — rename / recolor (reflects on every customer). */
export function useUpdateTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: TagUpdate }) =>
      apiFetch<TagResponse>(`/api/v1/admin/tags/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...TAGS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] })
    },
  })
}

/** `DELETE /api/v1/admin/tags/{id}` — remove from the vocabulary + every customer. */
export function useDeleteTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...TAGS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] })
    },
  })
}

/**
 * `POST /api/v1/admin/customers/{id}/tags` — attach a tag (by id or get-or-create
 * by name). Returns the customer's full tag list.
 */
export function useAttachTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ customerId, body }: { customerId: number, body: CustomerTagAssign }) =>
      apiFetch<TagChip[]>(`/api/v1/admin/customers/${customerId}/tags`, { method: 'POST', body }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...TAGS_NAMESPACE] })
    },
  })
}

/** `DELETE /api/v1/admin/customers/{id}/tags/{tagId}` — detach a tag. */
export function useDetachTag() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ customerId, tagId }: { customerId: number, tagId: number }) =>
      apiFetch<TagChip[]>(`/api/v1/admin/customers/${customerId}/tags/${tagId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] })
      void queryCache.invalidateQueries({ key: [...TAGS_NAMESPACE] })
    },
  })
}
