/**
 * Staff capability taxonomy — mirrors the backend `app/core/capabilities.py`.
 *
 * A staff account (`role === 'ADMIN'`) is either an **owner** (`is_owner`,
 * implicitly all capabilities) or a scoped staffer whose `capabilities` array
 * lists the exact grants. The frontend uses these to hide admin UI the staffer
 * can't use; the backend `require_capability` dep is the actual boundary.
 */

export const CAPABILITIES = [
  'catalog:write',
  'inventory:write',
  'orders:write',
  'orders:refund',
  'customers:write',
  'marketing:write',
  'content:write',
  'settings:write',
  'staff:write',
] as const

export type Capability = (typeof CAPABILITIES)[number]
