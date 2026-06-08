<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildApiUrl } from '#shared/constants/api'
import type { GuestOrderResponse } from '#shared/types/api'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

/**
 * Public account-less order tracking (`GET /orders/track/{token}`). The opaque
 * token in the URL is the whole credential — no login, no order id exposure.
 * Renders the backend's deliberately trimmed view: status, items, totals,
 * shipping method + shipment tracking, destination city/country only.
 *
 * Fetches via `useAsyncData` (NOT the authed Pinia Colada `['orders']`
 * namespace — a guest read must never seed or read the customer cache).
 * Unknown token → the backend 404s → a proper error page via `createError`.
 */

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const token = route.params.token as string

const { apiFetch } = useApi()
const { data: order, error } = await useAsyncData(
  `guest-order-track-${token}`,
  () => apiFetch<GuestOrderResponse>(buildApiUrl.orderTrack(token)),
)

// 404 unknown token, 429 over the rate limit — both become real error pages
// instead of an empty shell. Plain 404 keeps the no-enumeration posture.
if (error.value) {
  throw createError({
    statusCode: parseProblem(error.value)?.status ?? 404,
    statusMessage: t('orders.track.notFound'),
    fatal: true,
  })
}

useHead({ title: () => t('orders.track.title') })

function money(value: number) {
  return order.value
    ? formatMoney(value, order.value.currency as CurrencyCode, locale.value)
    : ''
}

const placedOn = computed(() =>
  order.value ? new Date(order.value.created_at).toLocaleDateString(locale.value) : '',
)
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-3xl px-4 py-8">
      <div
        v-if="order"
        class="space-y-6"
      >
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm text-muted">
              {{ t('orders.track.title') }}
            </p>
            <h1 class="text-2xl font-bold">
              {{ t('orders.detail.title', { number: order.order_number }) }}
            </h1>
            <p class="text-sm text-muted">
              {{ t('orders.detail.placedOn', { date: placedOn }) }}
            </p>
          </div>
          <OrdersStatusBadge :status="order.status" />
        </header>

        <OrdersTrackingSection
          :shipping-carrier="order.shipping_carrier"
          :tracking-number="order.tracking_number"
          :tracking-url="order.tracking_url"
        />

        <section>
          <h2 class="mb-2 font-semibold">
            {{ t('orders.detail.items') }}
          </h2>
          <ul
            :class="[
              'divide-y divide-gray-100 rounded-lg border border-gray-200',
              'dark:divide-gray-800 dark:border-gray-800',
            ]"
          >
            <li
              v-for="(item, index) in order.items"
              :key="index"
              class="flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p class="font-medium">
                  {{ item.product_name }}
                </p>
                <p
                  v-if="item.variant_title"
                  class="text-xs text-muted"
                  data-testid="track-item-variant"
                >
                  {{ item.variant_title }}
                </p>
                <p class="text-xs text-muted">
                  {{ item.quantity }} ×
                  {{ t('orders.detail.each', { price: money(item.unit_price) }) }}
                </p>
              </div>
              <span class="font-medium">{{ money(item.total_price) }}</span>
            </li>
          </ul>
        </section>

        <div class="grid gap-6 sm:grid-cols-2">
          <section class="space-y-1 text-sm">
            <h2 class="mb-2 font-semibold">
              {{ t('orders.track.shipping') }}
            </h2>
            <p
              class="text-muted"
              data-testid="track-ships-to"
            >
              {{ t('orders.track.shipsTo', { city: order.shipping_city, country: order.shipping_country }) }}
            </p>
            <p
              v-if="order.shipping_method_name"
              class="text-muted"
            >
              {{ t('orders.track.method') }}: {{ order.shipping_method_name }}
            </p>
          </section>

          <section class="h-fit rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div class="flex justify-between py-1 text-sm">
              <span class="text-muted">{{ t('orders.detail.subtotal') }}</span>
              <span>{{ money(order.subtotal) }}</span>
            </div>
            <div
              v-if="order.discount > 0"
              class="flex justify-between py-1 text-sm text-primary"
              data-testid="track-discount"
            >
              <span>{{ t('orders.detail.discount') }}</span>
              <span>−{{ money(order.discount) }}</span>
            </div>
            <div class="flex justify-between py-1 text-sm">
              <span class="text-muted">{{ t('orders.detail.shippingCost') }}</span>
              <span>{{ money(order.shipping) }}</span>
            </div>
            <div
              :class="[
                'mt-1 flex justify-between border-t border-gray-100 pt-2',
                'font-medium dark:border-gray-800',
              ]"
            >
              <span>{{ t('orders.detail.total') }}</span><span>{{ money(order.total) }}</span>
            </div>
          </section>
        </div>

        <UButton
          color="neutral"
          variant="soft"
          :to="localePath('/products')"
        >
          {{ t('cart.actions.continueShopping') }}
        </UButton>
      </div>
    </div>
  </NuxtLayout>
</template>
