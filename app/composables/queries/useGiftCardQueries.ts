/**
 * Pinia Colada query/mutation layer for admin gift cards.
 *
 * Cache keys are prefixed with `['gift-cards', ...]` so every mutation
 * invalidates the whole namespace with one call. All actions are
 * non-optimistic (refetch after success).
 *
 * The collection route is `/api/v1/admin/gift-cards/` (trailing slash —
 * FastAPI 307s the slashless form through the h3 proxy). Item routes carry
 * none.
 *
 * The issue POST's 201 (`GiftCardIssueResponse`) is the ONLY response carrying
 * the plaintext `code` — it is hashed at rest and never retrievable again, so
 * callers must surface it immediately (see `GiftCardIssueModal`).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type GiftCardResponse = components['schemas']['GiftCardResponse']
export type GiftCardListResponse = components['schemas']['GiftCardListResponse']
export type GiftCardDetailResponse = components['schemas']['GiftCardDetailResponse']
export type GiftCardEntryResponse = components['schemas']['GiftCardEntryResponse']
export type GiftCardIssueRequest = components['schemas']['GiftCardIssueRequest']
export type GiftCardIssueResponse = components['schemas']['GiftCardIssueResponse']
export type GiftCardUpdate = components['schemas']['GiftCardUpdate']
export type GiftCardAdjustRequest = components['schemas']['GiftCardAdjustRequest']
export type GiftCardCurrency = GiftCardIssueRequest['currency']

const GIFT_CARDS_NAMESPACE = ['gift-cards'] as const

export interface GiftCardListParams {
  page?: number
  pageSize?: number
  status?: 'active' | 'disabled'
  currency?: string
  q?: string
}

export function useGiftCardsQuery(params: MaybeRefOrGetter<GiftCardListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...GIFT_CARDS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<GiftCardListResponse>('/api/v1/admin/gift-cards/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          currency: p.currency,
          q: p.q || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `GET /api/v1/admin/gift-cards/{id}` — the card plus its ledger (newest first). */
export function useGiftCardQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...GIFT_CARDS_NAMESPACE, 'detail', toValue(id) ?? 0],
    query: () =>
      apiFetch<GiftCardDetailResponse>(`/api/v1/admin/gift-cards/${toValue(id)}`),
    enabled: () => import.meta.client && toValue(id) !== undefined,
    staleTime: 1000 * 60,
  })
}

/**
 * `POST /api/v1/admin/gift-cards/` — issue a card. The 201 carries the
 * plaintext `code` exactly once.
 */
export function useIssueGiftCard() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: GiftCardIssueRequest) =>
      apiFetch<GiftCardIssueResponse>('/api/v1/admin/gift-cards/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...GIFT_CARDS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/gift-cards/{id}` — status / expires_at / note. */
export function useUpdateGiftCard() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: GiftCardUpdate }) =>
      apiFetch<GiftCardResponse>(`/api/v1/admin/gift-cards/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...GIFT_CARDS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/gift-cards/{id}/adjust` — signed manual correction.
 * 400 `gift_card_balance_negative` (machine code in `detail`) when the result
 * would go below zero.
 */
export function useAdjustGiftCard() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: number, body: GiftCardAdjustRequest }) =>
      apiFetch<GiftCardDetailResponse>(`/api/v1/admin/gift-cards/${id}/adjust`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...GIFT_CARDS_NAMESPACE] }),
  })
}
