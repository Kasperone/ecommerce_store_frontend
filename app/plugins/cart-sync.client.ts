import { watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { API_ENDPOINTS } from '#shared/constants/api'
import type { SavedCartItemIn } from '#shared/types/api'

/**
 * Authed cart sync (abandoned-cart recovery v1), client-only.
 *
 * Mirrors the local Pinia cart into the server-side `saved_carts` snapshot via
 * `PUT /api/v1/carts/mine` so the backend's detection job can see abandonment:
 *
 * - Debounced (~2.5 s) on cart changes while authenticated — rapid quantity
 *   taps collapse into one upsert.
 * - An emptied cart (incl. checkout's `cart.clear()`) sends `items: []`,
 *   which deletes the server row — a completed order is never "abandoned".
 * - Fires once immediately when `isAuthenticated` flips to true, pushing the
 *   local cart up on login. Guests are never synced (v1 is authed-only).
 * - Best-effort: errors are swallowed — sync must never disturb shopping.
 *
 * The unchanged-upsert case is the backend's problem by contract (deep-equal
 * items must not touch the row), so re-sends are harmless.
 */

export default defineNuxtPlugin(() => {
  const authStore = useAuthStore()
  const cart = useCartStore()
  const { apiFetch } = useApi()

  function syncNow() {
    if (!authStore.isAuthenticated) return
    const items: SavedCartItemIn[] = cart.items.map(item => ({
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      quantity: item.quantity,
    }))
    // Best-effort fire-and-forget: a failed sync only costs a recovery email.
    void apiFetch(API_ENDPOINTS.CARTS.SYNC, { method: 'PUT', body: { items } })
      .catch(() => {})
  }

  const debouncedSync = useDebounceFn(syncNow, 2500)

  watch(
    () => cart.items,
    () => {
      if (authStore.isAuthenticated) void debouncedSync()
    },
    { deep: true },
  )

  // Push the local cart up the moment the user signs in (or a guest cart
  // becomes attributable). Boot-time restored sessions don't flip this watch —
  // the next cart interaction syncs instead, keeping hard loads request-free.
  watch(
    () => authStore.isAuthenticated,
    (authed) => {
      if (authed) syncNow()
    },
  )
})
