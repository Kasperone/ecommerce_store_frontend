/**
 * Storefront coupon validation (checkout preview).
 *
 * `POST /api/v1/coupons/validate` previews a discount code against the current
 * cart subtotal + currency. It's advisory — the authoritative validation +
 * `used_count` bump happen server-side when the order is created (the
 * `coupon_code` rides on the create-order payload), so a stale preview can never
 * apply an invalid code to a real order.
 *
 * A plain mutation (no cache): the result depends on subtotal/currency that the
 * caller owns, and nothing else reads it. On a non-2xx the backend returns a
 * `detail` string (expired / inactive / min-order / etc.) which the caller
 * surfaces via `parseProblem`.
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
