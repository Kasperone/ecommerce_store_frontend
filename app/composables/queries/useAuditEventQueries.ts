/**
 * Pinia Colada query layer for the admin audit log (read-only).
 *
 * The trail is written server-side by the AuditWriter; this is a pure read
 * view, so there are no mutations here. The collection route is
 * `/api/v1/admin/audit-events/` (trailing slash — FastAPI 307s the slashless
 * form through the h3 proxy).
 */

import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AuditEventListResponse } from '#shared/types/api'

export type AuditAction = 'create' | 'update' | 'delete'
// Keep in sync with the resource_type strings the backend AuditWriter records
// (grep the backend for `resource_type=`). These mirror the filter options in
// app/pages/admin/audit-log/index.vue.
export type AuditResourceType
  = | 'product'
    | 'product_image'
    | 'category'
    | 'order'
    | 'customer'
    | 'customer_note'
    | 'customer_tag'
    | 'tag'
    | 'inventory'
    | 'review'

export interface AuditEventListParams {
  page?: number
  pageSize?: number
  resourceType?: AuditResourceType
  action?: AuditAction
  resourceId?: number
}

const AUDIT_NAMESPACE = ['audit-events'] as const

export function useAuditEventsQuery(params: MaybeRefOrGetter<AuditEventListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...AUDIT_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<AuditEventListResponse>('/api/v1/admin/audit-events/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          resource_type: p.resourceType,
          action: p.action,
          resource_id: p.resourceId,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
    // Append-only log — 60s absorbs back-nav refetches without hiding new events for long.
    staleTime: 1000 * 60,
  })
}
