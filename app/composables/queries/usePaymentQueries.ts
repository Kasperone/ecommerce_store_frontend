/**
 * Pinia Colada mutation layer for payments (PayU + Stripe hosted-redirect flows).
 *
 * Each `useStart*Checkout` asks the backend to build a hosted payment page for
 * one of the caller's pending orders and returns the URL to send the buyer to
 * (`redirect_uri` for PayU, `checkout_url` for Stripe). They deliberately do NOT
 * invalidate the orders cache: the order is still `pending` at this point — the
 * provider settles it server-to-server via the signed webhook, and the
 * `/checkout/payment/return` page reflects the settled status afterwards.
 *
 * Guest checkout: all three checkout-start endpoints accept an anonymous caller
 * when a `?guest_token=` query param matches the order's token (404 on miss) —
 * pass `guestToken` for orders created without a bearer. Authed callers omit it
 * and stay scoped by ownership exactly as before.
 *
 * Failure modes surfaced by the backend (rendered via `parseProblem`):
 * 503 provider not configured · 404 not the caller's order · 409 not pending ·
 * 502 provider upstream error.
 */

import { useMutation, useQuery } from '@pinia/colada'
import type {
  PayUCheckoutResponse,
  StripeCheckoutResponse,
  StripeConfigResponse,
  StripePaymentIntentResponse,
} from '#shared/types/api'

export interface StartCheckoutVars {
  orderId: number
  /** Guest orders only: the order's opaque tracking token (no bearer sent). */
  guestToken?: string | null
}

/** `?guest_token=` only when present — authed calls keep a clean URL. */
function guestQuery(guestToken?: string | null) {
  return guestToken ? { guest_token: guestToken } : undefined
}

export function useStartPayuCheckout() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ orderId, guestToken }: StartCheckoutVars) =>
      apiFetch<PayUCheckoutResponse>(`/api/v1/payments/payu/orders/${orderId}`, {
        method: 'POST',
        query: guestQuery(guestToken),
      }),
  })
}

export function useStartStripeCheckout() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ orderId, guestToken }: StartCheckoutVars) =>
      apiFetch<StripeCheckoutResponse>(`/api/v1/payments/stripe/checkout/${orderId}`, {
        method: 'POST',
        query: guestQuery(guestToken),
      }),
  })
}

/**
 * Stripe browser config for the in-page Express Checkout Element (wallets).
 * Never errors on missing keys — the backend returns `configured: false` so the
 * `<CheckoutWalletButton>` hides the widget instead of rendering a dead button.
 * Public endpoint (guest checkout pays in-page too).
 */
export function useStripeConfig() {
  const { apiFetch } = useApi()
  return useQuery({
    key: ['payments', 'stripe', 'config'],
    query: () => apiFetch<StripeConfigResponse>('/api/v1/payments/stripe/config'),
    // Client-only: @pinia/colada doesn't serialize its cache across SSR, so a
    // server-run query renders data the client can't reproduce on first paint →
    // hydration mismatch. (Today its only caller is <ClientOnly>-wrapped, but
    // the gate is the real guarantee — enforced by the colada-ssr-gate guard.)
    enabled: () => import.meta.client,
  })
}

/**
 * Create a Stripe PaymentIntent for one of the caller's pending orders and
 * return the `client_secret` the browser confirms via the Express Checkout
 * Element. The order settles server-side from the `payment_intent.succeeded`
 * webhook, so — like the redirect flows — this does NOT invalidate the orders
 * cache.
 */
export function useCreateStripePaymentIntent() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ orderId, guestToken }: StartCheckoutVars) =>
      apiFetch<StripePaymentIntentResponse>(
        `/api/v1/payments/stripe/payment-intent/${orderId}`,
        { method: 'POST', query: guestQuery(guestToken) },
      ),
  })
}
