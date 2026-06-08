/**
 * Pinia Colada query/mutation layer for admin customer segments.
 *
 * Cache keys are prefixed with `['segments', ...]` so every mutation
 * invalidates the whole namespace with one call. All actions are
 * non-optimistic (refetch after success).
 *
 * The collection route is `/api/v1/admin/segments/` (trailing slash — FastAPI
 * 307s the slashless form through the h3 proxy). Item routes carry none.
 *
 * Previews are intentionally NOT cached/queried — they are fire-and-await
 * mutation-style calls (`previewFilters` for an unsaved `SegmentFilters` body,
 * `previewSaved` for a stored segment's resolved filters) so the filter builder
 * can debounce-call them on every field change.
 *
 * Segment types come straight from the generated `api.gen.ts` schema map.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type SegmentResponse = components['schemas']['SegmentResponse']
export type SegmentListResponse = components['schemas']['SegmentListResponse']
export type SegmentCreate = components['schemas']['SegmentCreate']
export type SegmentUpdate = components['schemas']['SegmentUpdate']
export type SegmentFilters = components['schemas']['SegmentFilters']
export type SegmentPreview = components['schemas']['SegmentPreview']

const SEGMENTS_NAMESPACE = ['segments'] as const

export interface SegmentListParams {
  page?: number
  pageSize?: number
  isActive?: boolean
  search?: string
}

export function useSegmentsQuery(params: MaybeRefOrGetter<SegmentListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...SEGMENTS_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<SegmentListResponse>('/api/v1/admin/segments/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          is_active: p.isActive,
          search: p.search || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/** `POST /api/v1/admin/segments/` — create a segment. */
export function useCreateSegment() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: SegmentCreate) =>
      apiFetch<SegmentResponse>('/api/v1/admin/segments/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...SEGMENTS_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/segments/{id}` — edit a segment (partial). */
export function useUpdateSegment() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: SegmentUpdate }) =>
      apiFetch<SegmentResponse>(`/api/v1/admin/segments/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...SEGMENTS_NAMESPACE] }),
  })
}

/** `DELETE /api/v1/admin/segments/{id}` — remove a segment. */
export function useDeleteSegment() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/segments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...SEGMENTS_NAMESPACE] }),
  })
}

/**
 * Imperative preview helpers (not Colada queries — driven on demand by the
 * filter builder + the campaign segment picker).
 *
 * `previewFilters` resolves an UNSAVED filter body against
 * `POST /api/v1/admin/segments/preview`; `previewSaved` resolves a stored
 * segment's filters via `GET /api/v1/admin/segments/{id}/preview`.
 */
export function useSegmentPreview() {
  const { apiFetch } = useApi()

  function previewFilters(filters: SegmentFilters, limit = 5) {
    return apiFetch<SegmentPreview>('/api/v1/admin/segments/preview', {
      method: 'POST',
      query: { limit },
      body: filters,
    })
  }

  function previewSaved(id: number, limit = 5) {
    return apiFetch<SegmentPreview>(`/api/v1/admin/segments/${id}/preview`, {
      query: { limit },
    })
  }

  return { previewFilters, previewSaved }
}
