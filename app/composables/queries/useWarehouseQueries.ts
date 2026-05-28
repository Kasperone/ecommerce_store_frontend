/**
 * Pinia Colada query/mutation layer for admin warehouses (stock locations).
 *
 * The collection is `/api/v1/admin/warehouses/` (trailing slash — FastAPI 307s
 * the slashless form through the h3 proxy); item routes carry none. Mutations
 * invalidate the `['warehouses']` namespace; create/update/delete also invalidate
 * `['inventory']` because a warehouse rename / default change / removal affects
 * how the inventory views render. All actions are non-optimistic (refetch after).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  WarehouseCreate,
  WarehouseListResponse,
  WarehouseResponse,
  WarehouseUpdate,
} from '#shared/types/api'

const WAREHOUSES_NAMESPACE = ['warehouses'] as const

export interface WarehouseListParams {
  page?: number
  pageSize?: number
  isActive?: boolean
}

export function useWarehousesQuery(params: MaybeRefOrGetter<WarehouseListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...WAREHOUSES_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<WarehouseListResponse>('/api/v1/admin/warehouses/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 50,
          is_active: p.isActive,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/** `POST /api/v1/admin/warehouses/` — create a warehouse. */
export function useCreateWarehouse() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: WarehouseCreate) =>
      apiFetch<WarehouseResponse>('/api/v1/admin/warehouses/', { method: 'POST', body }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...WAREHOUSES_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['inventory'] })
    },
  })
}

/** `PATCH /api/v1/admin/warehouses/{id}` — rename / (de)activate / reassign default. */
export function useUpdateWarehouse() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: WarehouseUpdate }) =>
      apiFetch<WarehouseResponse>(`/api/v1/admin/warehouses/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...WAREHOUSES_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['inventory'] })
    },
  })
}

/** `DELETE /api/v1/admin/warehouses/{id}` — remove an empty, non-default warehouse. */
export function useDeleteWarehouse() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/admin/warehouses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: [...WAREHOUSES_NAMESPACE] })
      void queryCache.invalidateQueries({ key: ['inventory'] })
    },
  })
}
