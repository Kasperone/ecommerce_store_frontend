/**
 * Pinia Colada query/mutation layer for the caller's OWN B2B company profile
 * (Wave D / D-D-4).
 *
 * - `useCompanyProfileQuery` — `GET /api/v1/companies/me` (the caller's company
 *   incl. their `role` + the editable profile fields).
 * - `useUpdateCompanyProfile` — `PATCH /api/v1/companies/me` (COMPANY_ADMIN-only,
 *   server-enforced; partial — only the changed fields are sent). Non-optimistic:
 *   on success it seeds the cache with the fresh snapshot and invalidates the
 *   namespace so any active query refetches the canonical row.
 *
 * Distinct from `useCompanyContext` (key `['company','me']`, the lightweight
 * B2B gate read used by the cart CTA + nav): this owns the profile-detail key
 * `['company','profile']` and the mutation. Types come straight from the
 * generated `api.gen` `components` map — the hand-rolled `shared/types/api.ts`
 * re-export layer doesn't surface them and isn't ours to edit.
 *
 * Client-only (`enabled: () => import.meta.client`) per the SSR-hydration rule
 * (#87): Colada's cache isn't serialized across SSR, so a server-run authed
 * query would throw a hydration mismatch on a hard load.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type CompanyMe = components['schemas']['CompanyMeResponse']
export type CompanyProfileUpdate = components['schemas']['CompanyProfileUpdate']
export type CompanyRole = CompanyMe['role']

const COMPANY_PROFILE_NAMESPACE = ['company', 'profile'] as const

/** `GET /api/v1/companies/me` — the caller's company profile (incl. `role`). */
export function useCompanyProfileQuery(enabled?: () => boolean) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...COMPANY_PROFILE_NAMESPACE],
    query: () => apiFetch<CompanyMe | null>('/api/v1/companies/me'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client && (enabled ? enabled() : true),
    // The B2B probe is near-static for a session; cache hard so it does not re-fire per page.
    staleTime: 1000 * 60 * 5,
    // Not-a-B2B-member is a 200 + null body (an expected outcome), not a
    // transient error — nothing to retry.
    retry: false,
  })
}

/** `PATCH /api/v1/companies/me` — partial update of the caller's company profile. */
export function useUpdateCompanyProfile() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (patch: CompanyProfileUpdate) =>
      apiFetch<CompanyMe>('/api/v1/companies/me', { method: 'PATCH', body: patch }),
    onSuccess: (data) => {
      // Seed both the profile-detail cache and the lightweight gate cache so the
      // nav/CTA and the page reflect the edit without a round-trip, then
      // invalidate so any active query refetches the canonical row.
      queryCache.setQueryData([...COMPANY_PROFILE_NAMESPACE], data)
      queryCache.setQueryData(['company', 'me'], data)
      void queryCache.invalidateQueries({ key: [...COMPANY_PROFILE_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['company', 'me'] })
    },
  })
}

/**
 * `POST /api/v1/companies/me/vies-check` — validate the company's EU VAT-ID
 * against VIES (COMPANY_ADMIN-only). Returns the refreshed company with the
 * `vies_*` status. 503 when VIES is disabled server-side, 422 when no VAT-ID is
 * set, 502 when VIES is temporarily unreachable — the page surfaces these.
 */
export function useVerifyMyCompanyVies() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: () => apiFetch<CompanyMe>('/api/v1/companies/me/vies-check', { method: 'POST' }),
    onSuccess: (data) => {
      queryCache.setQueryData([...COMPANY_PROFILE_NAMESPACE], data)
      queryCache.setQueryData(['company', 'me'], data)
      void queryCache.invalidateQueries({ key: [...COMPANY_PROFILE_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['company', 'me'] })
    },
  })
}
