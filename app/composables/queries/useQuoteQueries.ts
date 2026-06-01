/**
 * Pinia Colada query/mutation layer for admin B2B quotes.
 *
 * Cache keys are prefixed with `['quotes', ...]` so every mutation invalidates
 * the whole namespace with one call. All actions are non-optimistic (refetch
 * after success).
 *
 * The collection route is `/api/v1/admin/quotes/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Quote types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type QuoteResponse = components['schemas']['QuoteResponse']
export type QuoteListItem = components['schemas']['QuoteListItem']
export type QuoteListResponse = components['schemas']['QuoteListResponse']
export type QuoteCreate = components['schemas']['QuoteCreate']
export type QuoteUpdate = components['schemas']['QuoteUpdate']
export type QuoteItemCreate = components['schemas']['QuoteItemCreate']
export type QuoteItemResponse = components['schemas']['QuoteItemResponse']
export type QuoteStatus = QuoteResponse['status']
export type QuoteCurrency = QuoteCreate['currency']

const QUOTES_NAMESPACE = ['quotes'] as const

export interface QuoteListParams {
  page?: number
  pageSize?: number
  status?: QuoteStatus
  companyId?: number
}

// Quotes are admin/authed (no SEO) and the Pinia Colada plugin doesn't
// serialize its cache across SSR. Gating `enabled` to the client keeps these
// queries client-only so the server and the client's first render agree (both
// show the loading state) — see useOrderQueries for the full rationale.
export function useQuotesQuery(params: MaybeRefOrGetter<QuoteListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...QUOTES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<QuoteListResponse>('/api/v1/admin/quotes/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          company_id: p.companyId,
        },
      })
    },
    enabled: () => import.meta.client,
  })
}

/** `GET /api/v1/admin/quotes/{id}` — full quote with nested `items`. */
export function useQuoteQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...QUOTES_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Quote id is required'))
      }
      return apiFetch<QuoteResponse>(`/api/v1/admin/quotes/${value}`)
    },
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `POST /api/v1/admin/quotes/` — create a quote (201). Server computes
 * `line_total`/`subtotal`/`total`. 404 on unknown company, 422 on empty items.
 */
export function useCreateQuote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: QuoteCreate) =>
      apiFetch<QuoteResponse>('/api/v1/admin/quotes/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...QUOTES_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/admin/quotes/{id}` — edit status/notes/valid_until; a non-empty
 * `items` replaces the whole line set and recomputes totals (omit to leave lines
 * untouched).
 */
export function useUpdateQuote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: QuoteUpdate }) =>
      apiFetch<QuoteResponse>(`/api/v1/admin/quotes/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...QUOTES_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/quotes/{id}` — remove a quote (204). */
export function useDeleteQuote() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/quotes/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...QUOTES_NAMESPACE] }),
  })
}

/**
 * `GET /api/v1/admin/companies/` — lightweight companies fetch to populate the
 * quote company picker. The companies vertical owns the full CRUD; here we only
 * need the list (approved companies first) for a dropdown, so we keep a minimal
 * read-only query rather than depending on its composable. Client-only (authed).
 */
export type CompanyResponse = components['schemas']['CompanyResponse']
export type CompanyListResponse = components['schemas']['CompanyListResponse']

export function useQuoteCompaniesQuery(params: MaybeRefOrGetter<{ search?: string }> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...QUOTES_NAMESPACE, 'companies', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CompanyListResponse>('/api/v1/admin/companies/', {
        query: {
          page: 1,
          // A generous page so the picker holds the catalog without paging.
          page_size: 100,
          search: p.search || undefined,
        },
      })
    },
    enabled: () => import.meta.client,
  })
}
