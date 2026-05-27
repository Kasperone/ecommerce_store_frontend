/**
 * Pinia Colada query/mutation layer for admin customers.
 *
 * Cache keys are prefixed with `['customers', ...]` so mutations invalidate the
 * whole namespace with one call. All actions are non-optimistic (refetch after
 * success).
 *
 * The collection route is `/api/v1/admin/customers/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  CustomerAdminUpdate,
  CustomerDetail,
  CustomerListResponse,
} from '#shared/types/api'

export type CustomerRole = 'CUSTOMER' | 'ADMIN'

export interface CustomerListParams {
  page?: number
  pageSize?: number
  role?: CustomerRole
  isActive?: boolean
  isVerified?: boolean
  search?: string
  tagId?: number
}

const CUSTOMERS_NAMESPACE = ['customers'] as const

export function useCustomersQuery(params: MaybeRefOrGetter<CustomerListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CUSTOMERS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CustomerListResponse>('/api/v1/admin/customers/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          role: p.role,
          is_active: p.isActive,
          is_verified: p.isVerified,
          search: p.search || undefined,
          tag_id: p.tagId,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

export function useCustomerQuery(id: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...CUSTOMERS_NAMESPACE, 'detail', toValue(id)],
    query: () => {
      const value = toValue(id)
      if (value === undefined) {
        return Promise.reject(new Error('Customer id is required'))
      }
      return apiFetch<CustomerDetail>(`/api/v1/admin/customers/${value}`)
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(id) !== undefined,
  })
}

/**
 * `PATCH /api/v1/admin/customers/{id}` — toggle verification / active state.
 */
export function useUpdateCustomer() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CustomerAdminUpdate }) =>
      apiFetch<CustomerDetail>(`/api/v1/admin/customers/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/customers/{id}/unlock` — clear a brute-force lockout.
 */
export function useUnlockCustomer() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<CustomerDetail>(`/api/v1/admin/customers/${id}/unlock`, { method: 'POST' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...CUSTOMERS_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/customers/{id}/password-reset` — trigger the reset email.
 * Returns a generic message; never the token.
 */
export function useSendCustomerPasswordReset() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<{ message: string }>(`/api/v1/admin/customers/${id}/password-reset`, {
        method: 'POST',
      }),
  })
}
