/**
 * Shared TypeScript types for API requests and responses.
 *
 * Catalog types are re-exported from the auto-generated `api.gen.ts`
 * (`npm run gen:types` against a running local backend regenerates it).
 * Auth types remain hand-rolled here until a follow-up migrates them.
 */

import type { components } from './api.gen'

// Catalog — generated; do not edit shapes here.
export type CategoryResponse = components['schemas']['CategoryResponse']
export type CategoryWithProductCount = components['schemas']['CategoryWithProductCount']
export type CategoryCreate = components['schemas']['CategoryCreate']
export type CategoryUpdate = components['schemas']['CategoryUpdate']
// `CategoryTreeNode` is recursive — openapi-typescript splits it into
// Input/Output variants. Frontend consumers read the Output one.
export type CategoryTreeNode = components['schemas']['CategoryTreeNode-Output']
export type CategoryDeletePreview = components['schemas']['CategoryDeletePreview']
export type CategoryHeroResponse = components['schemas']['CategoryHeroResponse']
export type CategoryHeroAltUpdate = components['schemas']['CategoryHeroAltUpdate']
export type BulkReorderItem = components['schemas']['BulkReorderItem']
export type BulkReorderRequest = components['schemas']['BulkReorderRequest']
export type ProductResponse = components['schemas']['ProductResponse']
export type ProductWithCategory = components['schemas']['ProductWithCategory']
export type ProductCreate = components['schemas']['ProductCreate']
export type ProductUpdate = components['schemas']['ProductUpdate']
export type OrderStatus = components['schemas']['OrderStatus']
export type OrderListItem = components['schemas']['OrderListItem']
export type OrderListResponse = components['schemas']['OrderListResponse']
export type OrderResponse = components['schemas']['OrderResponse']
export type OrderWithUser = components['schemas']['OrderWithUser']
export type OrderItemResponse = components['schemas']['OrderItemResponse']
export type OrderCreate = components['schemas']['OrderCreate']
export type OrderUpdate = components['schemas']['OrderUpdate']
export type CustomerListItem = components['schemas']['CustomerListItem']
export type CustomerListResponse = components['schemas']['CustomerListResponse']
export type CustomerDetail = components['schemas']['CustomerDetail']
export type CustomerOrderMetrics = components['schemas']['CustomerOrderMetrics']
export type CustomerAdminUpdate = components['schemas']['CustomerAdminUpdate']
export type InventoryListItem = components['schemas']['InventoryListItem']
export type InventoryListResponse = components['schemas']['InventoryListResponse']
export type InventoryMovementItem = components['schemas']['InventoryMovementItem']
export type InventoryMovementListResponse = components['schemas']['InventoryMovementListResponse']
export type StockAdjustRequest = components['schemas']['StockAdjustRequest']

// User-related types
export interface UserResponse {
  email: string
  first_name: string
  last_name: string
  phone?: string | null
  is_active: boolean
  is_verified: boolean
  role: 'CUSTOMER' | 'ADMIN'
  created_at: string
  updated_at: string

  // Shipping address (optional)
  shipping_street?: string | null
  shipping_city?: string | null
  shipping_postal_code?: string | null
  shipping_country?: string | null
  shipping_state?: string | null

  // Company data (optional)
  company_name?: string | null
  company_tax_id?: string | null
  company_address_street?: string | null
  company_address_city?: string | null
  company_address_postal_code?: string | null
  company_address_country?: string | null
  company_address_state?: string | null
}

// Auth-related types
export interface TokenResponse {
  access_token: string
  token_type: string
}

// Generic single-message response (e.g. /auth/register, /auth/resend-verification).
// The backend returns the same shape regardless of whether the email is new,
// already registered, or already verified — to prevent account enumeration.
export interface MessageResponse {
  message: string
}

// Error types
export interface ApiError {
  detail: string
}

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  /**
   * Raw error from `$fetch` (FetchError-like). Present only on failure.
   * Forms can pass this to `normalizeApiError()` to extract per-field errors
   * from FastAPI 422 responses.
   */
  raw?: unknown
}
