/**
 * Pinia Colada mutation for the caller's account-deletion request (GDPR Art. 17).
 *
 * `POST /api/v1/me/account-deletion-request` immediately soft-deletes and
 * anonymizes the account (scrub PII, drop the address book, deactivate, revoke
 * every refresh token) — order/invoice rows are kept for tax retention. It is
 * IRREVERSIBLE. After a 200 the backend has revoked all refresh tokens and the
 * login email is a placeholder, so the caller MUST tear down its local session
 * (the page calls `authStore.clearSession()` and redirects home).
 *
 * Mutation-only: no query, no SSR concern (rule #87 only gates authed queries).
 *
 * `AccountDeletionResponse` is read straight from the generated OpenAPI types;
 * it's not re-exported through the hand-rolled `shared/types/api.ts` barrel.
 */

import { useMutation } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type AccountDeletionResponse = components['schemas']['AccountDeletionResponse']

/** `POST /api/v1/me/account-deletion-request` — irreversibly soft-delete the account. */
export function useAccountDeletion() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: () =>
      apiFetch<AccountDeletionResponse>('/api/v1/me/account-deletion-request', {
        method: 'POST',
      }),
  })
}
