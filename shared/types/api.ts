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
// OMNIBUS (Directive 98/6 Art. 6a) — see useProductLowest30d + ShopOmnibusPrice.
export type LowestPriceResponse = components['schemas']['LowestPriceResponse']
export type OrderStatus = components['schemas']['OrderStatus']
export type OrderListItem = components['schemas']['OrderListItem']
export type OrderListResponse = components['schemas']['OrderListResponse']
export type OrderResponse = components['schemas']['OrderResponse']
export type OrderWithUser = components['schemas']['OrderWithUser']
export type OrderItemResponse = components['schemas']['OrderItemResponse']
export type OrderCreate = components['schemas']['OrderCreate']
export type OrderUpdate = components['schemas']['OrderUpdate']
export type RefundCreate = components['schemas']['RefundCreate']
export type RefundResponse = components['schemas']['RefundResponse']
// v2 per-line picker — RefundItemCreate (request) carries an `order_item_id` +
// `quantity`; RefundItemResponse (response) additionally denormalises
// `product_name` / `unit_price` / `line_subtotal` from the joined order_item row.
export type RefundItemCreate = components['schemas']['RefundItemCreate']
export type RefundItemResponse = components['schemas']['RefundItemResponse']
// `reason` literal mirrors the backend enum + DB CHECK (cross-checked at import
// time in `app/schemas/refund.py`); deriving it from RefundCreate keeps the
// six allowed values in lock-step here.
export type RefundReason = RefundCreate['reason']
export type CorrectiveInvoiceResponse = components['schemas']['CorrectiveInvoiceResponse']
export type CustomerListItem = components['schemas']['CustomerListItem']
export type CustomerListResponse = components['schemas']['CustomerListResponse']
export type CustomerDetail = components['schemas']['CustomerDetail']
export type CustomerOrderMetrics = components['schemas']['CustomerOrderMetrics']
export type CustomerAdminUpdate = components['schemas']['CustomerAdminUpdate']
export type ImpersonationResponse = components['schemas']['ImpersonationResponse']
export type ImpersonatedCustomer = components['schemas']['ImpersonatedCustomer']
export type CustomerNoteResponse = components['schemas']['CustomerNoteResponse']
export type CustomerNoteCreate = components['schemas']['CustomerNoteCreate']
export type CustomerNoteUpdate = components['schemas']['CustomerNoteUpdate']
export type TagChip = components['schemas']['TagChip']
export type TagResponse = components['schemas']['TagResponse']
export type TagCreate = components['schemas']['TagCreate']
export type TagUpdate = components['schemas']['TagUpdate']
export type CustomerTagAssign = components['schemas']['CustomerTagAssign']
export type InventoryListItem = components['schemas']['InventoryListItem']
export type InventoryListResponse = components['schemas']['InventoryListResponse']
export type InventoryMovementItem = components['schemas']['InventoryMovementItem']
export type InventoryMovementListResponse = components['schemas']['InventoryMovementListResponse']
export type StockAdjustRequest = components['schemas']['StockAdjustRequest']
export type StockLevelItem = components['schemas']['StockLevelItem']
export type RestockRequest = components['schemas']['RestockRequest']
export type TransferRequest = components['schemas']['TransferRequest']
export type TransferResponse = components['schemas']['TransferResponse']
export type WarehouseResponse = components['schemas']['WarehouseResponse']
export type WarehouseListResponse = components['schemas']['WarehouseListResponse']
export type WarehouseCreate = components['schemas']['WarehouseCreate']
export type WarehouseUpdate = components['schemas']['WarehouseUpdate']
export type ShippingZoneListItem = components['schemas']['ShippingZoneListItem']
export type ShippingZoneListResponse = components['schemas']['ShippingZoneListResponse']
export type ShippingZoneDetail = components['schemas']['ShippingZoneDetail']
export type ShippingZoneCreate = components['schemas']['ShippingZoneCreate']
export type ShippingZoneUpdate = components['schemas']['ShippingZoneUpdate']
export type ShippingMethodResponse = components['schemas']['ShippingMethodResponse']
export type ShippingMethodListResponse = components['schemas']['ShippingMethodListResponse']
export type ShippingMethodCreate = components['schemas']['ShippingMethodCreate']
export type ShippingMethodUpdate = components['schemas']['ShippingMethodUpdate']
export type ShippingRateListItem = components['schemas']['ShippingRateListItem']
export type ShippingRateListResponse = components['schemas']['ShippingRateListResponse']
export type ShippingRateResponse = components['schemas']['ShippingRateResponse']
export type ShippingRateCreate = components['schemas']['ShippingRateCreate']
export type ShippingRateUpdate = components['schemas']['ShippingRateUpdate']
export type ShippingRateTier = components['schemas']['ShippingRateTier']
export type ShippingRateWeightTier = components['schemas']['ShippingRateWeightTier']
export type ShippingQuoteMethod = components['schemas']['ShippingQuoteMethod']
export type ShippingQuoteResponse = components['schemas']['ShippingQuoteResponse']
export type AuditEventItem = components['schemas']['AuditEventItem']
export type AuditEventListResponse = components['schemas']['AuditEventListResponse']
export type ReviewResponse = components['schemas']['ReviewResponse']
export type ReviewCreate = components['schemas']['ReviewCreate']
export type ReviewUpdate = components['schemas']['ReviewUpdate']
export type ReviewModerate = components['schemas']['ReviewModerate']
export type ReviewVoteResponse = components['schemas']['ReviewVoteResponse']
export type MyVotesResponse = components['schemas']['MyVotesResponse']
export type ProductReviewSummary = components['schemas']['ProductReviewSummary']
export type PublicReviewListResponse = components['schemas']['PublicReviewListResponse']
export type AdminReviewListItem = components['schemas']['AdminReviewListItem']
export type AdminReviewListResponse = components['schemas']['AdminReviewListResponse']

// Dashboard-related types
export type DashboardKpis = components['schemas']['DashboardKpis']
export type SalesTrendPoint = components['schemas']['SalesTrendPoint']
export type TopProductItem = components['schemas']['TopProductItem']
export type LowStockItem = components['schemas']['LowStockItem']

// Search-related types
export type SearchResponse = components['schemas']['SearchResponse']
export type SearchResultItem = components['schemas']['SearchResultItem']
export type FacetBucket = components['schemas']['FacetBucket']
export type SuggestResponse = components['schemas']['SuggestResponse']
export type SuggestProductItem = components['schemas']['SuggestProductItem']
export type SuggestCategoryItem = components['schemas']['SuggestCategoryItem']

// Payment-related types
export type PayUCheckoutResponse = components['schemas']['PayUCheckoutResponse']
export type StripeCheckoutResponse = components['schemas']['StripeCheckoutResponse']
export type StripeConfigResponse = components['schemas']['StripeConfigResponse']
export type StripePaymentIntentResponse = components['schemas']['StripePaymentIntentResponse']

// User-related types
export interface UserResponse {
  email: string
  first_name: string
  last_name: string
  phone?: string | null
  locale: 'en' | 'pl' // preferred language for transactional emails
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
