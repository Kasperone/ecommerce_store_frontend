/**
 * Pinia Colada query/mutation layer for a customer's store credit (admin).
 *
 * Store credit lives under the admin customers resource
 * (`/api/v1/admin/customers/{id}/store-credit[/adjust]`) — per-currency
 * accounts plus a unified ledger (newest first). Cache keys are namespaced
 * per customer so an adjust only refetches that customer's summary.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type StoreCreditSummaryResponse = components['schemas']['StoreCreditSummaryResponse']
export type StoreCreditAccountResponse = components['schemas']['StoreCreditAccountResponse']
export type StoreCreditEntryResponse = components['schemas']['StoreCreditEntryResponse']
export type StoreCreditAdjustRequest = components['schemas']['StoreCreditAdjustRequest']

const STORE_CREDIT_NAMESPACE = ['store-credit'] as const

/** `GET /api/v1/admin/customers/{id}/store-credit` — accounts + ledger. */
export function useCustomerStoreCreditQuery(customerId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...STORE_CREDIT_NAMESPACE, toValue(customerId) ?? 0],
    query: () =>
      apiFetch<StoreCreditSummaryResponse>(
        `/api/v1/admin/customers/${toValue(customerId)}/store-credit`,
      ),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client && toValue(customerId) !== undefined,
    staleTime: 1000 * 60,
  })
}

/**
 * `POST /api/v1/admin/customers/{id}/store-credit/adjust` — signed grant or
 * claw-back. 400 `store_credit_balance_negative` (machine code in `detail`)
 * when the result would go below zero.
 */
export function useAdjustCustomerStoreCredit() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ customerId, body }: { customerId: number, body: StoreCreditAdjustRequest }) =>
      apiFetch<StoreCreditSummaryResponse>(
        `/api/v1/admin/customers/${customerId}/store-credit/adjust`,
        { method: 'POST', body },
      ),
    onSuccess: (_data, { customerId }) =>
      queryCache.invalidateQueries({ key: [...STORE_CREDIT_NAMESPACE, customerId] }),
  })
}
