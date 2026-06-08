/**
 * Storefront coupon validation (checkout preview).
 *
 * `POST /api/v1/coupons/validate` previews the discount checkout would apply
 * against the current cart subtotal + shipping + currency. With a `code` it
 * validates the typed code (400 on failure, never a silent fallback to an
 * automatic); without one it previews the best matching **automatic** discount
 * (same `pick_best` as order create — 200 with null applied-fields when nothing
 * matches). `shipping_amount` is the already-resolved post-free-above amount —
 * it's what a `free_shipping` coupon saves.
 *
 * Advisory only — the authoritative validation + `used_count` bump happen
 * server-side when the order is created (manual codes ride on the create-order
 * payload; automatics are re-picked), so a stale preview can never apply an
 * invalid code to a real order.
 *
 * A plain mutation (no cache): the result depends on subtotal/shipping/currency
 * that the caller owns, and nothing else reads it. On a non-2xx the backend
 * returns a `detail` string (expired / inactive / min-order / etc.) which the
 * caller surfaces via `parseProblem`.
 *
 * Types come straight from the generated schema map — the hand-rolled
 * `#shared/types/api` re-export is orchestrator-owned (mirrors `useCouponQueries`).
 */

import { useMutation } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type CouponValidateRequest = components['schemas']['CouponValidateRequest']
export type CouponValidateResponse = components['schemas']['CouponValidateResponse']

/** `POST /api/v1/coupons/validate` — preview a code's discount (400 on invalid). */
export function useValidateCoupon() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (body: CouponValidateRequest) =>
      apiFetch<CouponValidateResponse>('/api/v1/coupons/validate', {
        method: 'POST',
        body,
      }),
  })
}
