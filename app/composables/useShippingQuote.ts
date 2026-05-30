/**
 * Debounced shipping-method quote for the checkout selector.
 *
 * Public + transient (cart subtotal + chosen country change as the customer
 * edits the form), so it fetches via `useApi().apiFetch` directly — no Pinia
 * Colada, no `useAsyncData`. Each `(country, currency, subtotal)` change
 * debounces (~250 ms) and aborts the previous in-flight request so a slow
 * earlier response can't overwrite a newer one. Same shape as
 * `useSearchSuggest`.
 *
 * The backend's `GET /shipping/quote` returns methods with prices already
 * resolved (free-above / tiers applied) — the component renders `amount`
 * directly and trusts the server. An empty `methods: []` is the "we don't
 * ship to <country>" signal, not an error.
 */

import { ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { ShippingQuoteMethod } from '#shared/types/api'

const DEBOUNCE_MS = 250

export interface ShippingQuoteParams {
  /** ISO-2 country code, uppercase. Empty string disables the fetch. */
  country: string
  /** USD / PLN / EUR — matches the cart's selected currency. */
  currency: string
  /** Cart subtotal in `currency`, used by the resolver for tiers + free-above. */
  subtotal: number
  /**
   * Cart total weight in kg. When non-zero, weight-tiered rates resolve against
   * ``max(weightKg, volumetricKg)`` where volumetricKg is computed server-side
   * from `cartVolumeCm3` + the resolved zone's divisor.
   * Optional — 0 falls through to subtotal-only resolution, preserving the old
   * behaviour for carts without weighted products.
   */
  weightKg?: number
  /**
   * Cart total volume in cm³ (frontend pre-sums per-line
   * `length × width × height × quantity`; lines missing any dimension
   * contribute 0). The backend reads this scalar + looks up the resolved
   * zone's `dim_divisor` to compute volumetric weight; the frontend never
   * sees the divisor. Default 0 + zones with NULL divisor are the legacy
   * path (actual weight only) — backwards-compatible.
   */
  cartVolumeCm3?: number
}

export function useShippingQuote(params: MaybeRefOrGetter<ShippingQuoteParams>) {
  const { apiFetch } = useApi()

  const methods = ref<ShippingQuoteMethod[]>([])
  const loading = ref(false)
  const failed = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let activeController: AbortController | undefined

  function reset() {
    methods.value = []
    loading.value = false
    failed.value = false
  }

  async function run(p: ShippingQuoteParams) {
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    loading.value = true
    failed.value = false
    try {
      const res = await apiFetch<{ methods: ShippingQuoteMethod[] }>(
        '/api/v1/shipping/quote',
        {
          query: {
            country: p.country,
            currency: p.currency,
            subtotal: p.subtotal,
            // Default to 0 (legacy carts without weighted products). The
            // backend treats 0 as "skip the weight branch" so old behaviour
            // is preserved automatically.
            weight_kg: p.weightKg ?? 0,
            // Same default rationale — the resolver only enters the
            // volumetric branch when BOTH this is > 0 AND the resolved
            // zone has a non-null dim_divisor.
            cart_volume_cm3: p.cartVolumeCm3 ?? 0,
          },
          signal: controller.signal,
        },
      )
      if (controller.signal.aborted) return
      methods.value = res.methods
    }
    catch (err) {
      // A superseded request was aborted on purpose — ignore it.
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
      failed.value = true
      methods.value = []
    }
    finally {
      if (activeController === controller) loading.value = false
    }
  }

  watch(
    () => toValue(params),
    (next) => {
      clearTimeout(debounceTimer)
      // Country empty = the form's country field hasn't been picked yet, so
      // skip the request rather than asking the backend for an empty country
      // (which 422s on the ISO-2 pattern).
      if (!next.country) {
        activeController?.abort()
        reset()
        return
      }
      debounceTimer = setTimeout(() => void run(next), DEBOUNCE_MS)
    },
    { deep: true, immediate: true },
  )

  /** Cancel any pending debounce/request (on unmount or country reset). */
  function clear() {
    clearTimeout(debounceTimer)
    activeController?.abort()
    reset()
  }

  return { methods, loading, failed, clear }
}
