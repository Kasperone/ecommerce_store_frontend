/**
 * Shared TypeScript types for API requests and responses
 */

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
