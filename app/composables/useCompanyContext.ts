/**
 * Client-gated B2B account context.
 *
 * `GET /api/v1/companies/me` resolves the caller's company via their active
 * `company_users` membership (Wave D generalized the Wave-C primary-contact
 * lookup; a backfilled primary contact resolves identically). A **200** means
 * the caller is a B2B account → show the "Request a quote" cart CTA + the
 * `/account/quotes` nav + the role-gated B2B settings sections. A **404** means
 * they're not a company member → hide every B2B surface.
 *
 * The response is a `CompanyMeResponse`, which carries the caller's B2B `role`
 * (`COMPANY_ADMIN` | `BUYER` | `APPROVER` | `VIEWER`) so callers can role-gate
 * (COMPANY_ADMIN edits profile/team; BUYER/VIEWER are read-only — D-D-6).
 *
 * The query is **client-gated** (`enabled: () => import.meta.client`): it's an
 * authed read and Pinia Colada doesn't serialize its cache across SSR, so a
 * server-run authed query throws a hydration mismatch on a hard load
 * (SSR-hydration rule #87).
 *
 * The 404 is the expected "not B2B" signal, not an error to surface — so
 * `isB2B` derives from a successful response with a non-null company while the
 * raw `error` is left for callers that genuinely want it (none currently do).
 */

import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import type { components } from '#shared/types/api.gen'

// Locally aliased (NOT re-exported): `CompanyResponse`/`CompanyMeResponse` are
// surfaced from other composables (`useQuoteQueries`/`useCompany`), so
// re-exporting here would collide on auto-import. Callers import the type from
// the owning composable.
type CompanyMe = components['schemas']['CompanyMeResponse']
type CompanyRole = CompanyMe['role']

const COMPANY_NAMESPACE = ['company', 'me'] as const

export function useCompanyContext() {
  const { apiFetch } = useApi()

  const query = useQuery({
    key: () => [...COMPANY_NAMESPACE],
    query: () => apiFetch<CompanyMe>('/api/v1/companies/me'),
    enabled: () => import.meta.client,
    // A 404 (not a B2B account) is an expected outcome, not a transient error —
    // don't retry it.
    retry: false,
  })

  // B2B only when the call resolved to a company. `isLoading` lets callers hold
  // the CTA/nav until the gate is known (avoids a flash of the B2B surface).
  const isB2B = computed(() => !!query.data.value)
  const company = computed(() => query.data.value ?? null)
  // The caller's B2B role (null until the gate resolves / for non-members). FE
  // surfaces gate on this: only COMPANY_ADMIN may edit the company profile/team.
  const role = computed<CompanyRole | null>(() => query.data.value?.role ?? null)

  return {
    company,
    isB2B,
    role,
    isResolving: query.isLoading,
    error: query.error,
  }
}
