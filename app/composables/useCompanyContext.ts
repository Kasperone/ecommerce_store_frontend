/**
 * Client-gated B2B account context.
 *
 * `GET /api/v1/companies/me` resolves the caller's company via their active
 * `company_users` membership (Wave D generalized the Wave-C primary-contact
 * lookup; a backfilled primary contact resolves identically). A **company
 * body** means the caller is a B2B account → show the "Request a quote" cart CTA
 * + the `/account/quotes` nav + the role-gated B2B settings sections. A **null
 * body** (the endpoint returns 200 + null, not 404 — this is probed on every
 * authed page, so a 404 would spam the browser console) means they're not a
 * company member → hide every B2B surface.
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
 * It is also **auth-gated**: guests are never B2B and the endpoint 401s
 * without a token. That matters because the cart CTA mounts on the PUBLIC
 * /cart page — an unauthenticated probe's 401 walks useApi's refresh-then-
 * bounce path and hard-redirects the guest to /login (caught by the
 * abandoned-cart recovery e2e spec: a recovered logged-out cart could never
 * be viewed). `enabled` is a reactive getter, so when a restored session
 * flips `isAuthenticated` post-boot the query activates and fetches then.
 *
 * A null body is the expected "not B2B" signal, not an error to surface — so
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
  const authStore = useAuthStore()

  const query = useQuery({
    key: () => [...COMPANY_NAMESPACE],
    query: () => apiFetch<CompanyMe | null>('/api/v1/companies/me'),
    // Client-gated (SSR-hydration rule #87) AND auth-gated (guests are never
    // B2B; an unauthed 401 would bounce guests to /login via useApi).
    enabled: () => import.meta.client && authStore.isAuthenticated,
    // The B2B probe is near-static for a session; cache hard so it does not re-fire per page.
    staleTime: 1000 * 60 * 5,
    // Not-a-B2B-account is a 200 + null body (an expected outcome), so there's
    // nothing to retry; keep retry off for a genuine transient error too.
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
