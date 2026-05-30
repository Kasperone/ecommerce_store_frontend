/**
 * TS port of the backend's `crud_shipping_rate.apply_shipping_rate` resolver.
 *
 * Used by the admin rate dialog's "preview" line so admins can probe a
 * subtotal client-side without round-tripping. The backend remains the source
 * of truth at order time — this resolver is preview-only and unit-tested
 * against the exact same matrix as `tests/unit/test_crud_shipping.py` so the
 * two implementations can never diverge.
 *
 * Precedence: free-above (zero-out) → tiers (band with the largest
 * `min_subtotal <= subtotal`) → flat `amount` fallback. Tiers are expected
 * sorted ascending by `min_subtotal` (the backend canonicalises on insert).
 */

export interface ShippingRateTier {
  min_subtotal: number
  amount: number
}

export interface ShippingRateLike {
  amount: number
  free_above_subtotal?: number | null
  tiers?: ShippingRateTier[] | null
}

export function applyShippingRate(rate: ShippingRateLike, subtotal: number): number {
  if (
    rate.free_above_subtotal !== null
    && rate.free_above_subtotal !== undefined
    && subtotal >= rate.free_above_subtotal
  ) {
    return 0
  }
  const tiers = rate.tiers
  if (tiers && tiers.length > 0) {
    let chosen: number | null = null
    // tiers are sorted ascending — once the next band's threshold passes the
    // subtotal we can stop walking.
    for (const band of tiers) {
      if (band.min_subtotal <= subtotal) {
        chosen = band.amount
      }
      else {
        break
      }
    }
    if (chosen !== null) return chosen
  }
  return rate.amount
}
