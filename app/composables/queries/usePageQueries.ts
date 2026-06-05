/**
 * Pinia Colada query/mutation layer for the admin CMS page builder.
 *
 * Mirrors `useBannerQueries.ts`: cache keys are prefixed with `['pages', ...]`
 * so a mutation invalidates the whole namespace with one call, and every query
 * gates `enabled: () => import.meta.client` (Colada isn't SSR-serialized — an
 * authed query that ran on the server would throw a hydration mismatch, the
 * PR #87 rule).
 *
 * The block-schema registry (`GET /blocks/schema`) is public + static; it still
 * goes through Colada for caching and the same client-only gate for consistency.
 *
 * Page types come straight from the generated `api.gen.ts` schema map (the
 * hand-rolled `#shared/types/api` re-export file is orchestrator-owned, so we
 * alias the schemas here instead of editing it).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type PageResponse = components['schemas']['PageResponse']
export type PageListResponse = components['schemas']['PageListResponse']
export type PageListItem = components['schemas']['PageListItem']
export type PageCreate = components['schemas']['PageCreate']
export type PageDraftUpdate = components['schemas']['PageDraftUpdate']
export type PagePublishRequest = components['schemas']['PagePublishRequest']
export type PageVersionListResponse = components['schemas']['PageVersionListResponse']
export type PageVersionResponse = components['schemas']['PageVersionResponse']
export type PreviewTokenResponse = components['schemas']['PreviewTokenResponse']
export type PageLayoutInput = components['schemas']['PageLayout-Input']
export type PageLayoutOutput = components['schemas']['PageLayout-Output']
export type PageStatus = PageResponse['status']
export type PageType = PageResponse['type']
export type PageLocale = PageResponse['locale']

/** A single section as edited/saved (the `-Input` union member). */
export type SectionInput = NonNullable<PageLayoutInput['sections']>[number]

const PAGES_NAMESPACE = ['pages'] as const

export interface PageListParams {
  page?: number
  pageSize?: number
  status?: PageStatus
  type?: PageType
  locale?: PageLocale
}

/** `GET /api/v1/admin/pages` — paginated admin pages list. */
export function usePagesQuery(params: MaybeRefOrGetter<PageListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PAGES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<PageListResponse>('/api/v1/admin/pages/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status || undefined,
          type: p.type || undefined,
          locale: p.locale || undefined,
        },
      })
    },
    enabled: () => import.meta.client,
  })
}

/** `GET /api/v1/admin/pages/{id}` — a single page (draft + published + meta). */
export function usePageQuery(id: MaybeRefOrGetter<number | null | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PAGES_NAMESPACE, 'detail', toValue(id) ?? 0],
    query: () => apiFetch<PageResponse>(`/api/v1/admin/pages/${toValue(id)}`),
    // Client-only AND skip until we have a real id.
    enabled: () => import.meta.client && !!toValue(id),
  })
}

/** `GET /api/v1/admin/pages/{id}/versions` — version history, newest first. */
export function usePageVersionsQuery(id: MaybeRefOrGetter<number | null | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PAGES_NAMESPACE, 'versions', toValue(id) ?? 0],
    query: () => apiFetch<PageVersionListResponse>(`/api/v1/admin/pages/${toValue(id)}/versions`),
    enabled: () => import.meta.client && !!toValue(id),
  })
}

/** `GET /api/v1/blocks/schema` — the declarative settings-schema registry. */
export function useBlockSchemasQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PAGES_NAMESPACE, 'block-schemas'],
    query: () => apiFetch<BlockSchemaRegistry>('/api/v1/blocks/schema'),
    enabled: () => import.meta.client,
  })
}

/** `POST /api/v1/admin/pages` — create a page. */
export function useCreatePage() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: PageCreate) =>
      apiFetch<PageResponse>('/api/v1/admin/pages/', { method: 'POST', body }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAGES_NAMESPACE] }),
  })
}

/** `PATCH /api/v1/admin/pages/{id}/draft` — save the working draft. */
export function useSavePageDraft() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: PageDraftUpdate }) =>
      apiFetch<PageResponse>(`/api/v1/admin/pages/${id}/draft`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAGES_NAMESPACE] }),
  })
}

/** `POST /api/v1/admin/pages/{id}/publish` — snapshot a version + go live. */
export function usePublishPage() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: number, body?: PagePublishRequest }) =>
      apiFetch<PageResponse>(`/api/v1/admin/pages/${id}/publish`, {
        method: 'POST',
        body: body ?? {},
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAGES_NAMESPACE] }),
  })
}

/** `POST /api/v1/admin/pages/{id}/versions/{versionId}/rollback` — restore a snapshot. */
export function useRollbackPageVersion() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, versionId }: { id: number, versionId: number }) =>
      apiFetch<PageResponse>(`/api/v1/admin/pages/${id}/versions/${versionId}/rollback`, {
        method: 'POST',
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...PAGES_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/pages/{id}/preview-token` — mint a short-lived signed
 * token for the draft-preview route (`GET /pages/{slug}/preview?token=`).
 *
 * Read-only on the server (no page data changes), so it does not invalidate the
 * `pages` cache namespace.
 */
export function useCreatePreviewToken() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ id }: { id: number }) =>
      apiFetch<PreviewTokenResponse>(`/api/v1/admin/pages/${id}/preview-token`, {
        method: 'POST',
      }),
  })
}

// --------------------------------------------------------------------------- //
// Block-schema registry shape                                                 //
// --------------------------------------------------------------------------- //
// `GET /blocks/schema` is typed `{ [key: string]: unknown }` in api.gen.ts
// (FastAPI returns a plain dict). We narrow it here to the declarative
// Shopify-style schema the admin auto-form consumes. These shapes mirror the
// backend `BLOCK_SCHEMAS` registry (app/schemas/page.py).

/** A single setting control descriptor from the schema registry. */
export interface BlockSettingSchema {
  type: string
  id: string
  label: string
  default?: unknown
  info?: string
  // select
  options?: { value: string, label: string }[]
  // range
  min?: number
  max?: number
  step?: number
  // product/collection
  multiple?: boolean
  [key: string]: unknown
}

/** A nested-block sub-schema (slideshow slides, gallery images, faq items…). */
export interface BlockChildSchema {
  name: string
  settings: BlockSettingSchema[]
}

/** A top-level block type's schema. */
export interface BlockSchema {
  type: string
  name: string
  settings: BlockSettingSchema[]
  blocks?: Record<string, BlockChildSchema>
  presets?: { name: string, settings: Record<string, unknown> }[]
}

/** The full `/blocks/schema` response. */
export interface BlockSchemaRegistry {
  blocks: BlockSchema[]
}
