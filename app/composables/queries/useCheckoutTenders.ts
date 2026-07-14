/**
 * Storefront (buyer-facing) query/mutation layer for the stored-value tenders:
 * the public gift-card balance check and the signed-in customer's own store
 * credit. These are deliberately separate from the admin surfaces
 * (`useGiftCardQueries` / `useStoreCreditQueries`) — different routes, different
 * auth, no shared cache namespace.
 *
 * - `useCheckGiftCard()` → `POST /api/v1/gift-cards/check` (public, 10/min/IP):
 *   a balance preview keyed by `{ code, currency }`. It never returns card
 *   metadata (only `last4` + `balance`), and it fails LOUD with the pinned
 *   machine codes (mapped to copy via `giftCardCheckErrorKey`).
 * - `useMyStoreCreditQuery()` → `GET /api/v1/account/store-credit` (authed):
 *   the caller's per-currency accounts + ledger. Client-gated (rule #87 — the
 *   Colada plugin isn't SSR-serialized, so an authed server query mismatches).
 */

import { useMutation, useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type GiftCardCheckRequest = components['schemas']['GiftCardCheckRequest']
export type GiftCardCheckResponse = components['schemas']['GiftCardCheckResponse']
export type StoreCreditSummaryResponse = components['schemas']['StoreCreditSummaryResponse']
export type StoreCreditAccountResponse = components['schemas']['StoreCreditAccountResponse']
export type StoreCreditEntryResponse = components['schemas']['StoreCreditEntryResponse']

/**
 * `POST /api/v1/gift-cards/check` — public balance preview. Rejects with the
 * pinned machine codes (404 `gift_card_not_found`; 409 `gift_card_disabled` /
 * `gift_card_expired` / `gift_card_depleted` / `gift_card_currency_mismatch` /
 * `gift_cards_disabled`; 429 rate limit). Non-optimistic, no cache — a check is
 * an ephemeral preview, the authoritative debit happens at order create.
 */
export function useCheckGiftCard() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (body: GiftCardCheckRequest) =>
      apiFetch<GiftCardCheckResponse>('/api/v1/gift-cards/check', { method: 'POST', body }),
  })
}

/**
 * `GET /api/v1/account/store-credit` — the signed-in customer's own store
 * credit (per-currency accounts + ledger, newest first). Client-gated; pass a
 * getter for `enabled` so the checkout field can additionally require an authed
 * session (a guest never fires the 401).
 */
export function useMyStoreCreditQuery(enabled: MaybeRefOrGetter<boolean> = true) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => ['account-store-credit'],
    query: () => apiFetch<StoreCreditSummaryResponse>('/api/v1/account/store-credit'),
    enabled: () => import.meta.client && toValue(enabled),
    staleTime: 1000 * 60,
  })
}
