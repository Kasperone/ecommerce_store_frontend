/**
 * Client-gated B2B account context.
 *
 * `GET /api/v1/companies/me` resolves the caller's company (via
 * `companies.primary_user_id == caller.id`). A **200** means the caller is a B2B
 * account → show the "Request a quote" cart CTA + the `/account/quotes` nav. A
 * **404** means they're not a company contact → hide every B2B surface.
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

// Locally aliased (NOT re-exported): `CompanyResponse` is already exported from
// the admin `useQuoteQueries` composable, so re-exporting it here would collide
// on auto-import. Callers that need the type import it from there.
type Company = components['schemas']['CompanyResponse']

const COMPANY_NAMESPACE = ['company', 'me'] as const

export function useCompanyContext() {
  const { apiFetch } = useApi()

  const query = useQuery({
    key: () => [...COMPANY_NAMESPACE],
    query: () => apiFetch<Company>('/api/v1/companies/me'),
    enabled: () => import.meta.client,
    // A 404 (not a B2B account) is an expected outcome, not a transient error —
    // don't retry it.
    retry: false,
  })

  // B2B only when the call resolved to a company. `isLoading` lets callers hold
  // the CTA/nav until the gate is known (avoids a flash of the B2B surface).
  const isB2B = computed(() => !!query.data.value)
  const company = computed(() => query.data.value ?? null)

  return {
    company,
    isB2B,
    isResolving: query.isLoading,
    error: query.error,
  }
}
