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
  StockLevelItem,
  TransferResponse,
} from '#shared/types/api'

export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'backorder'

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
  warehouseId?: number
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
          warehouse_id: p.warehouseId,
        },
      })
    },
    // Client-only: avoids an SSR hydration mismatch (Colada isn't SSR-serialized).
    enabled: () => import.meta.client,
  })
}

/**
 * `GET /api/v1/admin/inventory/products/{id}/levels` — per-warehouse breakdown
 * (always includes the default warehouse, synthesised from unallocated stock).
 */
export function useProductLevels(productId: MaybeRefOrGetter<number | null>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...INVENTORY_NAMESPACE, 'levels', toValue(productId)],
    query: () =>
      apiFetch<StockLevelItem[]>(
        `/api/v1/admin/inventory/products/${toValue(productId)}/levels`,
      ),
    // Client-only + only once a product is selected (the dialog passes null when closed).
    enabled: () => import.meta.client && toValue(productId) !== null,
  })
}

/**
 * `PATCH /api/v1/admin/inventory/products/{id}/stock` — set a warehouse's absolute
 * stock; the backend computes + records the signed delta. Returns the ledger row.
 */
export function useAdjustStock() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({
      productId,
      warehouseId,
      newStock,
      note,
    }: {
      productId: number
      warehouseId: number
      newStock: number
      note?: string
    }) =>
      apiFetch<InventoryMovementItem>(
        `/api/v1/admin/inventory/products/${productId}/stock`,
        {
          method: 'PATCH',
          body: { warehouse_id: warehouseId, new_stock: newStock, note: note || undefined },
        },
      ),
    onSuccess: () => queryCache.invalidateQueries({ key: [...INVENTORY_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/inventory/products/{id}/restock` — add incoming stock to a
 * warehouse (records a `restock` movement).
 */
export function useRestock() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({
      productId,
      warehouseId,
      quantity,
      note,
    }: {
      productId: number
      warehouseId: number
      quantity: number
      note?: string
    }) =>
      apiFetch<InventoryMovementItem>(
        `/api/v1/admin/inventory/products/${productId}/restock`,
        {
          method: 'POST',
          body: { warehouse_id: warehouseId, quantity, note: note || undefined },
        },
      ),
    onSuccess: () => queryCache.invalidateQueries({ key: [...INVENTORY_NAMESPACE] }),
  })
}

/**
 * `POST /api/v1/admin/inventory/transfer` — move stock between two warehouses
 * (paired transfer_out/in; the product total is unchanged).
 */
export function useTransferStock() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({
      productId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      note,
    }: {
      productId: number
      fromWarehouseId: number
      toWarehouseId: number
      quantity: number
      note?: string
    }) =>
      apiFetch<TransferResponse>('/api/v1/admin/inventory/transfer', {
        method: 'POST',
        body: {
          product_id: productId,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          quantity,
          note: note || undefined,
        },
      }),
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
