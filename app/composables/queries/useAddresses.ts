/**
 * Pinia Colada query + mutations for the caller's own address book.
 *
 * Backed by the addresses router:
 *   - `GET    /api/v1/addresses`              → list (default-shipping first, newest)
 *   - `POST   /api/v1/addresses`              → create
 *   - `PUT    /api/v1/addresses/{id}`         → update (partial)
 *   - `DELETE /api/v1/addresses/{id}`         → delete (204)
 *
 * The list query is **client-gated** (`enabled: () => import.meta.client`): it's
 * an authed read and Pinia Colada doesn't serialize its cache across SSR, so a
 * server-run authed query throws a hydration mismatch on a hard load
 * (SSR-hydration rule #87). All mutations are non-optimistic — they invalidate
 * the namespace so the list refetches from the server (which recomputes the
 * default-mutual-exclusion, enforced server-side).
 *
 * Types are read straight from the generated OpenAPI `components` map; they're
 * not re-exported through the hand-rolled `shared/types/api.ts` barrel.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type Address = components['schemas']['AddressResponse']
export type AddressCreate = components['schemas']['AddressCreate']
export type AddressUpdate = components['schemas']['AddressUpdate']

const ADDRESSES_NAMESPACE = ['addresses'] as const

/**
 * `GET /api/v1/addresses` — the caller's addresses (default-shipping first).
 *
 * Client-only: authed read, Colada isn't SSR-serialized (rule #87).
 *
 * `enabled` lets mixed-audience surfaces (guest checkout) skip the authed read
 * entirely for anonymous visitors instead of firing a guaranteed 401.
 */
export function useAddressesQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ADDRESSES_NAMESPACE, 'list'],
    query: () => apiFetch<Address[]>('/api/v1/addresses'),
    enabled: () => import.meta.client && toValue(enabled),
  })
}

/** `POST /api/v1/addresses` — create an address, then refetch the list. */
export function useCreateAddress() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: AddressCreate) =>
      apiFetch<Address>('/api/v1/addresses', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ADDRESSES_NAMESPACE] }),
  })
}

/** `PUT /api/v1/addresses/{id}` — update an address, then refetch the list. */
export function useUpdateAddress() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: number, body: AddressUpdate }) =>
      apiFetch<Address>(`/api/v1/addresses/${id}`, { method: 'PUT', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ADDRESSES_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/addresses/{id}` — delete an address (204), then refetch. */
export function useDeleteAddress() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...ADDRESSES_NAMESPACE] }),
  })
}

/**
 * Set an address as the default shipping and/or billing address — a thin alias
 * over {@link useUpdateAddress}. The set-default UI flips just the relevant
 * `is_default_*` flag(s) via a partial PUT; the server clears the same flag on
 * the caller's other rows (mutual exclusion), then the list refetches.
 */
export const useSetDefaultAddress = useUpdateAddress
