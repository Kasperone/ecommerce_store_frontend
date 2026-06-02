/**
 * Pinia Colada query + mutation for the current user's active login sessions.
 *
 * Backed by the auth router:
 *   - `GET    /api/v1/auth/sessions`          → list active refresh-token rows
 *   - `DELETE /api/v1/auth/sessions/{id}`     → revoke one (204)
 *
 * The query is **client-gated** (`enabled: () => import.meta.client`): it's an
 * authed read and Pinia Colada doesn't serialize its cache across SSR, so a
 * server-run authed query throws a hydration mismatch on a hard load
 * (SSR-hydration rule #87). Revoke is non-optimistic — it invalidates the
 * namespace so the table refetches from the server (which recomputes the
 * `current` flag).
 *
 * `SessionResponse` is read straight from the generated OpenAPI types; it's not
 * re-exported through the hand-rolled `shared/types/api.ts` barrel.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type SessionResponse = components['schemas']['SessionResponse']

const SESSIONS_NAMESPACE = ['sessions'] as const

/**
 * `GET /api/v1/auth/sessions` — the caller's active sessions, current one flagged.
 */
export function useSessionsQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...SESSIONS_NAMESPACE, 'list'],
    query: () => apiFetch<SessionResponse[]>('/api/v1/auth/sessions'),
    // Client-only: authed read, Colada isn't SSR-serialized (rule #87).
    enabled: () => import.meta.client,
  })
}

/**
 * `DELETE /api/v1/auth/sessions/{id}` — revoke a single session (204). Refetches
 * the list on success so the now-removed row disappears.
 */
export function useRevokeSession() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...SESSIONS_NAMESPACE] }),
  })
}
