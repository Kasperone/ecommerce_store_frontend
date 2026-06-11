/**
 * TS port of the backend's `crud_shipping_rate.apply_shipping_rate` resolver.
 *
 * Used by the admin rate dialog's "preview" line so admins can probe a
 * subtotal + cart weight client-side without round-tripping. The backend
 * remains the source of truth at order time — this resolver is preview-only
 * and unit-tested against the EXACT same matrix as
 * `tests/unit/test_crud_shipping.py` so the two implementations can never
 * diverge.
 *
 * Precedence (matches D1 in the weight-tiers handoff):
 *   1. free-above (zero-out at threshold)
 *   2. weight-tiers (cheapest band whose `max_weight_kg >= cart_weight`)
 *   3. subtotal-tiers (largest `min_subtotal <= subtotal`)
 *   4. flat `amount` fallback
 *
 * Both tier lists are expected sorted ascending (the backend canonicalises
 * on insert/update). `weightKg` is optional — call sites that don't yet
 * thread cart weight (admin previews pre-weight) keep working with the
 * default of 0 (weight branch skipped cleanly).
 */

import type { ShippingRateTier, ShippingRateWeightTier } from '#shared/types/api'

export interface ShippingRateLike {
  amount: number
  free_above_subtotal?: number | null
  tiers?: ShippingRateTier[] | null
  weight_tiers?: ShippingRateWeightTier[] | null
}

export function applyShippingRate(
  rate: ShippingRateLike,
  subtotal: number,
  weightKg: number = 0,
): number {
  if (
    rate.free_above_subtotal !== null
    && rate.free_above_subtotal !== undefined
    && subtotal >= rate.free_above_subtotal
  ) {
    return 0
  }
  const weightTiers = rate.weight_tiers
  if (weightTiers && weightTiers.length > 0 && weightKg > 0) {
    // Smallest band whose max_weight_kg >= weight covers the cart at the
    // cheapest price. Bands are sorted ascending so the first match wins.
    // Weight exceeding every band → fall through to subtotal-tiers / flat.
    for (const band of weightTiers) {
      if (band.max_weight_kg >= weightKg) {
        return band.amount
      }
    }
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
