/**
 * Pinia Colada query/mutation layer for admin B2B payment terms (net-terms tail
 * Program A). A payment term is a named net-terms template (net_days /
 * due_on_receipt / fixed_date) assigned to a company via `payment_term_id`.
 *
 * Cache keys are prefixed with `['paymentTerms', ...]` so every mutation
 * invalidates the whole namespace with one call. Non-optimistic (refetch after
 * success). Mirrors `usePriceListQueries`.
 *
 * The collection route is `/api/v1/admin/payment-terms/` (trailing slash —
 * FastAPI 307s the slashless form). Item routes carry none.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type PaymentTermResponse = components['schemas']['PaymentTermResponse']
export type PaymentTermListResponse = components['schemas']['PaymentTermListResponse']
export type PaymentTermCreate = components['schemas']['PaymentTermCreate']
export type PaymentTermUpdate = components['schemas']['PaymentTermUpdate']
export type PaymentTermType = components['schemas']['PaymentTermType']

const PAYMENT_TERMS_NAMESPACE = ['paymentTerms'] as const

export interface PaymentTermListParams {
  page?: number
  pageSize?: number
  search?: string
}

/** `GET /api/v1/admin/payment-terms/` — paginated list. */
export function usePaymentTermsQuery(params: MaybeRefOrGetter<PaymentTermListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PAYMENT_TERMS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<PaymentTermListResponse>('/api/v1/admin/payment-terms/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          search: p.search || undefined,
        },
      })
    },
    enabled: () => import.meta.client,
    staleTime: 1000 * 60,
  })
}

/** `POST /api/v1/admin/payment-terms/` — create a term (201). */
export function useCreatePaymentTerm() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: PaymentTermCreate) =>
      apiFetch<PaymentTermResponse>('/api/v1/admin/payment-terms/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAYMENT_TERMS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/payment-terms/{id}` — edit a term. */
export function useUpdatePaymentTerm() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: PaymentTermUpdate }) =>
      apiFetch<PaymentTermResponse>(`/api/v1/admin/payment-terms/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAYMENT_TERMS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/payment-terms/{id}` — remove a term (204); assigned companies unassign. */
export function useDeletePaymentTerm() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/payment-terms/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAYMENT_TERMS_NAMESPACE] }),
  })
}
