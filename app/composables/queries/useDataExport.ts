/**
 * Pinia Colada mutation for the caller's GDPR data export (Art. 15/20).
 *
 * `POST /api/v1/me/data-export` returns the full personal-data snapshot
 * (`user` + `addresses` + `orders` + `consents`) as a loosely-typed JSON dump.
 * There is no query here — the export is a one-shot, on-demand action the user
 * triggers from the privacy page; the page turns the response into a downloaded
 * file (Blob + anchor). Mutations don't run during SSR, so no client-gate is
 * needed (the SSR-hydration rule #87 only applies to authed *queries*).
 *
 * `DataExportResponse` is read straight from the generated OpenAPI types; it's
 * not re-exported through the hand-rolled `shared/types/api.ts` barrel.
 */

import { useMutation } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type DataExportResponse = components['schemas']['DataExportResponse']

/** `POST /api/v1/me/data-export` — the caller's full personal-data snapshot. */
export function useDataExport() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: () =>
      apiFetch<DataExportResponse>('/api/v1/me/data-export', { method: 'POST' }),
  })
}
