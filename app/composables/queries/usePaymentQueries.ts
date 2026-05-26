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
 * Failure modes surfaced by the backend (rendered via `parseProblem`):
 * 503 provider not configured · 404 not the caller's order · 409 not pending ·
 * 502 provider upstream error.
 */

import { useMutation } from '@pinia/colada'
import type { PayUCheckoutResponse, StripeCheckoutResponse } from '#shared/types/api'

export function useStartPayuCheckout() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (orderId: number) =>
      apiFetch<PayUCheckoutResponse>(`/api/v1/payments/payu/orders/${orderId}`, {
        method: 'POST',
      }),
  })
}

export function useStartStripeCheckout() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (orderId: number) =>
      apiFetch<StripeCheckoutResponse>(`/api/v1/payments/stripe/checkout/${orderId}`, {
        method: 'POST',
      }),
  })
}
