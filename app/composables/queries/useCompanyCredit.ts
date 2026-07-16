/**
 * Pinia Colada query for the caller's B2B net-terms credit summary (Program 2).
 *
 * `GET /api/v1/companies/me/credit` → `CompanyCreditResponse`
 * (`net_terms_enabled`, `net_terms_days`, `currency`, `credit_limit`,
 * `outstanding`, `available`). A non-B2B caller gets a
 * `{ net_terms_enabled: false }` body (200, not 404 — same quiet-probe posture
 * as `GET /companies/me`), so `enabled` gates on auth to avoid a guest 401
 * bounce and the response is never an error to surface.
 *
 * Drives the checkout "pay on account" option (eligibility + due term +
 * remaining credit) and the account company portal credit card.
 *
 * Client-only (`enabled: () => import.meta.client`) per the SSR-hydration rule
 * (#87): Colada's cache isn't serialized across SSR.
 */

import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import type { components } from '#shared/types/api.gen'

export type CompanyCredit = components['schemas']['CompanyCreditResponse']

const COMPANY_CREDIT_NAMESPACE = ['company', 'credit'] as const

export function useCompanyCredit() {
  const { apiFetch } = useApi()
  const authStore = useAuthStore()

  const query = useQuery({
    key: () => [...COMPANY_CREDIT_NAMESPACE],
    query: () => apiFetch<CompanyCredit>('/api/v1/companies/me/credit'),
    // Client-gated (Colada isn't SSR-serialized) AND auth-gated (the endpoint
    // 401s a guest, which would bounce them via useApi's refresh-then-redirect).
    enabled: () => import.meta.client && authStore.isAuthenticated,
    staleTime: 1000 * 60 * 2,
    retry: false,
  })

  // Pay-on-account is offered only when the company has net terms enabled AND a
  // configured term length (the backend guards identically in resolve_net_terms).
  const netTermsEligible = computed(
    () => !!query.data.value?.net_terms_enabled && query.data.value?.net_terms_days != null,
  )

  return {
    credit: computed(() => query.data.value ?? null),
    netTermsEligible,
    isResolving: query.isLoading,
    refetch: query.refetch,
  }
}
