/**
 * Pinia Colada query/mutation layer for admin customer notes.
 *
 * Notes are keyed under the `['customers', ...]` namespace so mutations invalidate
 * both the per-customer note list AND the customer list/detail (the `note_count`
 * there refreshes for free). All actions are non-optimistic (refetch after success).
 *
 * Note routes carry no trailing slash (`/customers/{id}/notes`, `/.../notes/{noteId}`)
 * — the FastAPI handlers are declared without one, so no 307 through the h3 proxy.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  CustomerNoteCreate,
  CustomerNoteResponse,
  CustomerNoteUpdate,
} from '#shared/types/api'

const CUSTOMERS_NAMESPACE = ['customers'] as const

export function useCustomerNotesQuery(customerId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CUSTOMERS_NAMESPACE, 'notes', toValue(customerId)],
    query: () => {
      const id = toValue(customerId)
      if (id === undefined) {
        return Promise.reject(new Error('Customer id is required'))
      }
      return apiFetch<CustomerNoteResponse[]>(`/api/v1/admin/customers/${id}/notes`)
    },
    // Client-only (+ id present) — Colada isn't SSR-serialized; see useCustomerQueries.ts.
    enabled: () => import.meta.client && toValue(customerId) !== undefined,
  })
}

/** `POST /api/v1/admin/customers/{id}/notes` — add a note. */
export function useCreateNote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ customerId, body }: { customerId: number, body: CustomerNoteCreate }) =>
      apiFetch<CustomerNoteResponse>(`/api/v1/admin/customers/${customerId}/notes`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/customers/{id}/notes/{noteId}` — edit a note's text. */
export function useUpdateNote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({
      customerId,
      noteId,
      body,
    }: {
      customerId: number
      noteId: number
      body: CustomerNoteUpdate
    }) =>
      apiFetch<CustomerNoteResponse>(`/api/v1/admin/customers/${customerId}/notes/${noteId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/customers/{id}/notes/{noteId}` — remove a note. */
export function useDeleteNote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ customerId, noteId }: { customerId: number, noteId: number }) =>
      apiFetch<unknown>(`/api/v1/admin/customers/${customerId}/notes/${noteId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] }),
  })
}
