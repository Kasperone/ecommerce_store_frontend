/**
 * Pinia Colada query/mutation layer for the caller's own preferences.
 *
 * Exposed at `/api/v1/me/preferences` (GET returns the snapshot, PATCH applies a
 * partial update and returns the updated snapshot). The PATCH invalidates the
 * `['me', 'preferences']` namespace so the query refetches the canonical row.
 *
 * The query is client-only (`enabled: () => import.meta.client`) per the project
 * SSR-hydration rule (#87): Colada's cache isn't serialized across SSR, so a
 * server-run authed query would throw a hydration mismatch on hard load. This is
 * also what keeps the currency override SSR-safe (D-A-5): the server/guest path
 * never reads the persisted preference, so it stays the deterministic locale
 * default until the client query resolves post-hydration.
 *
 * Types come straight from the generated `api.gen` `components` map — the
 * hand-rolled `shared/types/api.ts` re-export layer doesn't surface them and
 * isn't ours to edit.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { Ref } from 'vue'
import type { components } from '#shared/types/api.gen'

export type Preferences = components['schemas']['PreferencesResponse']
export type PreferencesUpdate = components['schemas']['PreferencesUpdate']

const PREFERENCES_NAMESPACE = ['me', 'preferences'] as const

/**
 * The slice of the Colada query consumers actually read. Kept narrow on purpose:
 * during SSR the composable returns a plain stub (see below), so widening this
 * (e.g. to expose `refetch`/`asyncStatus`) means also widening the stub.
 */
interface PreferencesQuery {
  data: Ref<Preferences | undefined>
}

/**
 * `GET /api/v1/me/preferences` — the caller's preferences snapshot.
 *
 * Client-only AND auth-gated: guests never hold a session, so firing the query
 * for them would 401. Callers that already know they're authed can leave the
 * extra gate at its default (`true`).
 */
export function usePreferencesQuery(enabled?: () => boolean): PreferencesQuery {
  // SSR: don't register the (disabled) query in the Colada cache at all. The
  // cache entry holds its options verbatim — `enabled`/`query` are functions —
  // and nitro's prerender link-inspection pass serializes the payload without
  // the runtime `skipHydrate` reducer, so devalue 500s any inspected SSR route
  // ("Cannot stringify a function" on HEAD /pl at build time). The query is
  // `enabled: false` on the server anyway and nothing reads more than `data`
  // before the client query resolves post-hydration.
  if (import.meta.server) {
    return { data: ref<Preferences | undefined>(undefined) }
  }
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PREFERENCES_NAMESPACE],
    query: () => apiFetch<Preferences>('/api/v1/me/preferences'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client && (enabled ? enabled() : true),
  })
}

/** `PATCH /api/v1/me/preferences` — partial update of the caller's preferences. */
export function useUpdatePreferences() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (patch: PreferencesUpdate) =>
      apiFetch<Preferences>('/api/v1/me/preferences', { method: 'PATCH', body: patch }),
    onSuccess: (data) => {
      // Seed the cache with the fresh snapshot, then invalidate so any active
      // query refetches the canonical row.
      queryCache.setQueryData([...PREFERENCES_NAMESPACE], data)
      void queryCache.invalidateQueries({ key: [...PREFERENCES_NAMESPACE] })
    },
  })
}
