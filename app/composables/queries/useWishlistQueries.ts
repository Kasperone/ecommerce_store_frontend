/**
 * Pinia Colada query + mutations for the caller's own wishlist.
 *
 * Backed by the wishlist router (all routes auth-required):
 *   - `GET    /api/v1/wishlist`            → list (newest-first, server-sorted)
 *   - `POST   /api/v1/wishlist`            → add (201 new / 200 idempotent re-add)
 *   - `DELETE /api/v1/wishlist/{item_id}`  → remove (204)
 *
 * The list query is **client-gated** (`enabled: () => import.meta.client && …`):
 * it's an authed read and Pinia Colada doesn't serialize its cache across SSR, so
 * a server-run authed query throws a hydration mismatch on a hard load
 * (SSR-hydration rule #87). The gate also keeps the query closed for guests so it
 * never fires a guaranteed 401. Mutations are non-optimistic — they invalidate
 * the namespace so the list refetches from the server.
 *
 * Types are read straight from the generated OpenAPI `components` map.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type WishlistItem = components['schemas']['WishlistItemRead']
export type WishlistItemCreate = components['schemas']['WishlistItemCreate']

const WISHLIST_NAMESPACE = ['wishlist'] as const

/**
 * `GET /api/v1/wishlist` — the caller's saved items (newest-first).
 *
 * Client-only + auth-gated (rule #87). Mixed-audience surfaces (the PDP) pass an
 * `enabled` getter so anonymous visitors skip the authed read entirely.
 */
export function useWishlistQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...WISHLIST_NAMESPACE, 'list'],
    query: () => apiFetch<WishlistItem[]>('/api/v1/wishlist'),
    enabled: () => import.meta.client && toValue(enabled),
  })
}

/**
 * `POST /api/v1/wishlist` — add a product (optionally a specific variant), then
 * refetch the list. The backend treats a re-add idempotently (200) — both 200
 * and 201 resolve here as success.
 */
export function useAddToWishlist() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: WishlistItemCreate) =>
      apiFetch<WishlistItem>('/api/v1/wishlist', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...WISHLIST_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/wishlist/{item_id}` — remove an item (204), then refetch. */
export function useRemoveFromWishlist() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (itemId: number) =>
      apiFetch<unknown>(`/api/v1/wishlist/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...WISHLIST_NAMESPACE] }),
  })
}

/**
 * Aggregator over the list query that exposes the cheap membership lookups the
 * heart toggle needs without each caller re-deriving them. Auth-gated via the
 * store, so guests get an empty list and `isInWishlist` is always false.
 *
 * Membership is keyed on `(product_id, variant_id)` so a variant-pinned save
 * and a product-grain save of the same product are distinct rows — the heart on
 * the PDP reflects exactly the currently-selected variant.
 */
export function useWishlist() {
  const authStore = useAuthStore()
  const query = useWishlistQuery(() => authStore.isAuthenticated)
  const items = computed<WishlistItem[]>(() => query.data.value ?? [])

  function findItem(productId: number, variantId: number | null = null): WishlistItem | null {
    return items.value.find(
      item => item.product_id === productId && (item.variant_id ?? null) === (variantId ?? null),
    ) ?? null
  }

  function isInWishlist(productId: number, variantId: number | null = null): boolean {
    return findItem(productId, variantId) != null
  }

  return { items, isLoading: query.isLoading, findItem, isInWishlist }
}
