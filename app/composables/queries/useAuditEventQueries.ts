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
export type AuditResourceType = 'product' | 'category' | 'order' | 'customer' | 'inventory'

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
  })
}
