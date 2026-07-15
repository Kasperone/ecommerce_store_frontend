/**
 * Pinia Colada query/mutation layer for the per-order timeline (order_events).
 *
 * The list is reverse-chron (newest first) straight from the backend; the
 * comment mutation invalidates the order's event namespace on success. Client-
 * only (`enabled`) like the other authed admin queries — Colada isn't
 * SSR-serialized.
 *
 * Types come from the generated `api.gen.ts` schema map.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

export type OrderEventResponse = components['schemas']['OrderEventResponse']
export type OrderEventCreate = components['schemas']['OrderEventCreate']

const ORDER_EVENTS_NAMESPACE = ['order-events'] as const

export function useOrderEventsQuery(orderId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...ORDER_EVENTS_NAMESPACE, toValue(orderId)],
    query: () => apiFetch<OrderEventResponse[]>(`/api/v1/orders/${toValue(orderId)}/events`),
    enabled: () => import.meta.client && toValue(orderId) != null,
    staleTime: 1000 * 30,
  })
}

/**
 * `POST /api/v1/orders/{orderId}/events` — append a free-text staff comment
 * (`kind='note'`). Invalidates the order's timeline on success.
 */
export function useAddOrderComment() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ orderId, comment }: { orderId: number, comment: string }) =>
      apiFetch<OrderEventResponse>(`/api/v1/orders/${orderId}/events`, {
        method: 'POST',
        body: { comment } satisfies OrderEventCreate,
      }),
    onSuccess: (_data, { orderId }) =>
      queryCache.invalidateQueries({ key: [...ORDER_EVENTS_NAMESPACE, orderId] }),
  })
}
