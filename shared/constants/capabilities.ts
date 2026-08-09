/**
 * Staff capability taxonomy — mirrors the backend `app/core/capabilities.py`.
 *
 * A staff account (`role === 'ADMIN'`) is either an **owner** (`is_owner`,
 * implicitly all capabilities) or a scoped staffer whose `capabilities` array
 * lists the exact grants. The frontend uses these to hide admin UI the staffer
 * can't use; the backend `require_capability` / `require_read` deps are the
 * actual boundary.
 *
 * ⚠️ **Write implies read, and that expansion is NOT done here.** Holding
 * `catalog:write` authorises `catalog:read` (plus, for some domains, a
 * cross-module read like `tax:read`) without the read ever being stored. The
 * implication table lives backend-side only, and `/auth/me` returns the
 * expanded set as `effective_capabilities` — which is what `auth.can()` tests.
 * Do not re-derive the table here: two copies in two languages drift silently,
 * and the failure mode is a nav item that vanishes for a staffer the API would
 * have served.
 */

/** Capabilities that fence a write/DELETE admin route. */
export const WRITE_CAPABILITIES = [
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

/**
 * Capabilities that fence admin *reads* (SEC-021). Finer-grained than the write
 * set on purpose: `companies`, `shipping` and `tax` are cross-module read
 * targets, so folding them into `customers:read` / `settings:read` would
 * over-grant the customer database and store config to every order staffer.
 *
 * `reports:read` and `audit:read` are **standalone** — no write capability
 * implies them, so they must be granted explicitly.
 */
export const READ_CAPABILITIES = [
  'catalog:read',
  'inventory:read',
  'orders:read',
  'customers:read',
  'companies:read',
  'marketing:read',
  'content:read',
  'settings:read',
  'shipping:read',
  'tax:read',
  'staff:read',
  'reports:read',
  'audit:read',
] as const

export const CAPABILITIES = [...WRITE_CAPABILITIES, ...READ_CAPABILITIES] as const

export type WriteCapability = (typeof WRITE_CAPABILITIES)[number]
export type ReadCapability = (typeof READ_CAPABILITIES)[number]
export type Capability = WriteCapability | ReadCapability
