/**
 * Pinia Colada query/mutation layer for the CUSTOMER B2B quotes surface.
 *
 * Distinct from `useQuoteQueries` (the admin `/api/v1/admin/quotes` CRUD): these
 * hit the customer router `/api/v1/quotes/` (caller's own company only) and live
 * under their own cache namespace `['my-quotes', ...]` so the two don't cross-
 * invalidate.
 *
 * - `GET  /api/v1/quotes/`             → list (newest-first; `[]` for non-B2B)
 * - `POST /api/v1/quotes/`             → request a quote from cart lines (201)
 * - `GET  /api/v1/quotes/{id}`         → one quote with nested items (404 cross-company)
 * - `POST /api/v1/quotes/{id}/accept`  → accept a `sent` quote (→ `accepted`; 409 else)
 *
 * The collection route carries a **trailing slash** (FastAPI 307s the slashless
 * form through the h3 proxy); item routes carry none.
 *
 * Reads are **client-gated** (`enabled: () => import.meta.client`): authed reads,
 * and Colada isn't SSR-serialized — a server-run authed query throws a hydration
 * mismatch on a hard load (SSR-hydration rule #87).
 *
 * Quote types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` barrel is orchestrator-owned).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type Quote = components['schemas']['QuoteResponse']
export type QuoteItem = components['schemas']['QuoteItemResponse']
export type QuoteRequestCreate = components['schemas']['QuoteRequestCreate']

const MY_QUOTES_NAMESPACE = ['my-quotes'] as const

/** `GET /api/v1/quotes/` — the caller's company's quotes, newest-first. */
export function useMyQuotesQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...MY_QUOTES_NAMESPACE, 'list'],
    query: () => apiFetch<Quote[]>('/api/v1/quotes/'),
    enabled: () => import.meta.client,
  })
}

/** `GET /api/v1/quotes/{id}` — one quote with nested `items`. 404 cross-company. */
export function useMyQuoteQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...MY_QUOTES_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Quote id is required'))
      }
      return apiFetch<Quote>(`/api/v1/quotes/${value}`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `POST /api/v1/quotes/` — request a quote from cart lines.
 *
 * Body `{ currency, items: [{ product_id, quantity }], notes? }`. The server
 * prices every line from the current product price in `currency` (a client price
 * is ignored — the schema has no such field). 403 `not_b2b` if the caller is no
 * company's primary contact; 422 on an empty/invalid line set. Invalidates the
 * namespace so the list refetches.
 */
export function useRequestQuote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: QuoteRequestCreate) =>
      apiFetch<Quote>('/api/v1/quotes/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...MY_QUOTES_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/quotes/{id}/accept` — accept a `sent` quote (→ `accepted`).
 *
 * Only a `sent` quote may be accepted (409 otherwise); cross-company → 404.
 * Conversion stays admin-only — accepting does NOT create an order. Invalidates
 * the namespace so both the list and the detail refetch fresh.
 */
export function useAcceptQuote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<Quote>(`/api/v1/quotes/${id}/accept`, { method: 'POST' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...MY_QUOTES_NAMESPACE] }),
  })
}
