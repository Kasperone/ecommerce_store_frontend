/**
 * Pinia Colada mutation layer for payments (PayU hosted-redirect flow).
 *
 * `useStartPayuCheckout` asks the backend to create a PayU order for one of the
 * caller's pending orders and returns the hosted `redirect_uri` to send the
 * buyer to. It deliberately does NOT invalidate the orders cache: the order is
 * still `pending` at this point — PayU settles it server-to-server via the
 * signed webhook, and the `/checkout/payment/return` page refetches the order
 * afterwards to reflect the settled status.
 *
 * Failure modes surfaced by the backend (rendered via `parseProblem`):
 * 503 PayU not configured · 404 not the caller's order · 409 not pending ·
 * 502 PayU upstream error.
 */

import { useMutation } from '@pinia/colada'
import type { PayUCheckoutResponse } from '#shared/types/api'

export function useStartPayuCheckout() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (orderId: number) =>
      apiFetch<PayUCheckoutResponse>(`/api/v1/payments/payu/orders/${orderId}`, {
        method: 'POST',
      }),
  })
}
