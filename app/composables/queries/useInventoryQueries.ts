/**
 * Pinia Colada query/mutation layer for admin inventory.
 *
 * Cache keys are prefixed with `['inventory', ...]` so mutations invalidate the
 * whole namespace (list + movements) with one call. All actions are
 * non-optimistic (refetch after success).
 *
 * The stock list is `/api/v1/admin/inventory/` (trailing slash — FastAPI 307s
 * the slashless form through the h3 proxy). The `/movements` and `/products/{id}
 * /stock` paths are literal, so they carry no trailing slash.
 *
 * `useSetLowStockThreshold` writes through the products endpoint (the threshold
 * lives on the product) but invalidates the inventory namespace too, so the
 * stock list reflects the new threshold/status immediately — covering the "edit
 * the threshold from the inventory adjust dialog" path.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  InventoryListResponse,
  InventoryMovementItem,
  InventoryMovementListResponse,
  ProductResponse,
} from '#shared/types/api'

export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface InventoryListParams {
  page?: number
  pageSize?: number
  status?: InventoryStatus
  search?: string
}

export interface InventoryMovementParams {
  page?: number
  pageSize?: number
  productId?: number
}

const INVENTORY_NAMESPACE = ['inventory'] as const

export function useInventoryQuery(params: MaybeRefOrGetter<InventoryListParams> = {}) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...INVENTORY_NAMESPACE, 'list', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<InventoryListResponse>('/api/v1/admin/inventory/', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          status: p.status,
          search: p.search || undefined,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

export function useInventoryMovementsQuery(
  params: MaybeRefOrGetter<InventoryMovementParams> = {},
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...INVENTORY_NAMESPACE, 'movements', toValue(params)],
    query: () => {
      const p = toValue(params)
      return apiFetch<InventoryMovementListResponse>('/api/v1/admin/inventory/movements', {
        query: {
          page: p.page ?? 1,
          page_size: p.pageSize ?? 20,
          product_id: p.productId,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/**
 * `PATCH /api/v1/admin/inventory/products/{id}/stock` — set absolute stock;
 * the backend computes + records the signed delta. Returns the ledger row.
 */
export function useAdjustStock() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({
      productId,
      newStock,
      note,
    }: {
      productId: number
      newStock: number
      note?: string
    }) =>
      apiFetch<InventoryMovementItem>(
        `/api/v1/admin/inventory/products/${productId}/stock`,
        { method: 'PATCH', body: { new_stock: newStock, note: note || undefined } },
      ),
    onSuccess: () => queryCache.invalidateQueries({ key: [...INVENTORY_NAMESPACE] }),
  })
}

/**
 * `PUT /api/v1/products/{id}` with just the threshold — keeps the stock list in
 * sync by invalidating both the inventory and products namespaces.
 */
export function useSetLowStockThreshold() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ productId, threshold }: { productId: number, threshold: number | null }) =>
      apiFetch<ProductResponse>(`/api/v1/products/${productId}`, {
        method: 'PUT',
        body: { low_stock_threshold: threshold },
      }),
    onSuccess: () =>
      Promise.all([
        queryCache.invalidateQueries({ key: [...INVENTORY_NAMESPACE] }),
        queryCache.invalidateQueries({ key: ['products'] }),
      ]),
  })
}
