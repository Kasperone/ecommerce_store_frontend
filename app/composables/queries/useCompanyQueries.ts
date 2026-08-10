/**
 * Pinia Colada query/mutation layer for the admin B2B company directory.
 *
 * Cache keys are prefixed with `['companies', ...]` so every mutation invalidates
 * the whole namespace with one call. All actions are non-optimistic (refetch
 * after success).
 *
 * The collection route is `/api/v1/admin/companies/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Company types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type CompanyResponse = components['schemas']['CompanyResponse']
export type CompanyListResponse = components['schemas']['CompanyListResponse']
export type CompanyCreate = components['schemas']['CompanyCreate']
export type CompanyUpdate = components['schemas']['CompanyUpdate']
export type CompanyCreditResponse = components['schemas']['CompanyCreditResponse']
export type CompanyStatus = CompanyResponse['status']

const COMPANIES_NAMESPACE = ['companies'] as const

export interface CompanyListParams {
  page?: number
  pageSize?: number
  status?: CompanyStatus
  search?: string
}

export function useCompaniesQuery(params: MaybeRefOrGetter<CompanyListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COMPANIES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<CompanyListResponse>('/api/v1/admin/companies/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          search: p.search || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/**
 * `GET /api/v1/admin/companies/{id}/credit` — the company's net-terms credit
 * summary (limit / outstanding AR / available). Gated on a truthy id (the modal
 * only fetches when editing an existing company).
 */
export function useCompanyCreditQuery(id: MaybeRefOrGetter<number | null>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COMPANIES_NAMESPACE, 'credit', toValue(id)],
    query: () =>
      apiFetch<CompanyCreditResponse>(`/api/v1/admin/companies/${toValue(id)}/credit`),
    enabled: () => import.meta.client && toValue(id) != null,
    staleTime: 1000 * 30,
  })
}

/** `POST /api/v1/admin/companies/` — create a company. */
export function useCreateCompany() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: CompanyCreate) =>
      apiFetch<CompanyResponse>('/api/v1/admin/companies/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COMPANIES_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/companies/{id}` — edit a company (changed fields only). */
export function useUpdateCompany() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CompanyUpdate }) =>
      apiFetch<CompanyResponse>(`/api/v1/admin/companies/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COMPANIES_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/companies/{id}` — remove a company. */
export function useDeleteCompany() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/companies/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...COMPANIES_NAMESPACE] }),
  })
}
