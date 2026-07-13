/**
 * Pinia Colada query/mutation layer for the admin store settings singleton.
 *
 * The store config is a single DB row exposed at `/api/v1/admin/settings`
 * (no trailing slash, no id in the path — there is exactly one record). The
 * GET feeds the settings form; the PATCH applies a partial update and the
 * mutation invalidates the `['settings']` namespace so the form refetches the
 * canonical row (incl. the server-managed `updated_at`).
 *
 * The query is client-only (`enabled: () => import.meta.client`) per the
 * project SSR-hydration rule (#87): Colada's cache isn't serialized across SSR,
 * so a server-run authed query would throw a hydration mismatch on hard load.
 *
 * Types come straight from the generated `api.gen` `components` map — the
 * hand-rolled `shared/types/api.ts` re-export layer doesn't surface them and
 * isn't ours to edit.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

// TODO: fold into api.gen.ts resync after BE merge — the abandoned-cart fields
// (plan §2.3) aren't in the generated schema yet because `npm run gen:types`
// needs the new backend live on localhost:8000. Drop these intersections once
// the resync lands them in `StoreConfigResponse` / `StoreConfigUpdate`.
interface AbandonedCartConfigFields {
  abandoned_cart_enabled?: boolean
  abandoned_cart_threshold_hours?: number
}

export type StoreConfig = components['schemas']['StoreConfigResponse'] & AbandonedCartConfigFields
export type StoreConfigUpdate = components['schemas']['StoreConfigUpdate'] & AbandonedCartConfigFields

const SETTINGS_NAMESPACE = ['settings'] as const

/** `GET /api/v1/admin/settings` — the store-config singleton. */
export function useStoreConfigQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...SETTINGS_NAMESPACE],
    query: () => apiFetch<StoreConfig>('/api/v1/admin/settings'),
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** `PATCH /api/v1/admin/settings` — partial update of the store config. */
export function useUpdateStoreConfig() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (patch: StoreConfigUpdate) =>
      apiFetch<StoreConfig>('/api/v1/admin/settings', { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...SETTINGS_NAMESPACE] })
    },
  })
}
