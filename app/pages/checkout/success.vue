<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { OrderResponse } from '#shared/types/api'

// No `user` middleware — guests land here after checkout too. The order state
// below is the only data source; a hard reload clears it for everyone alike.

const { t, locale } = useI18n()
const localePath = useLocalePath()

// Set by the checkout page before navigating here; null on a hard reload.
const order = useState<OrderResponse | null>('checkout:lastOrder', () => null)

// Guest orders (user_id = null) carry a tracking token: the "view order" CTA
// targets the public track page — guests have no /account/orders.
const viewOrderTo = computed(() => {
  if (!order.value) return null
  return order.value.guest_token
    ? localePath(`/orders/track/${order.value.guest_token}`)
    : localePath(`/account/orders/${order.value.id}`)
})

useHead({ title: () => t('checkout.success.title') })

const total = computed(() =>
  order.value
    ? formatMoney(order.value.total, order.value.currency as CurrencyCode, locale.value)
    : null,
)
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <ClientOnly>
        <UIcon
          name="i-lucide-circle-check"
          class="mx-auto mb-4 size-14 text-success"
        />
        <h1 class="text-2xl font-bold">
          {{ t('checkout.success.title') }}
        </h1>
        <p class="mt-2 text-muted">
          {{ t('checkout.success.message') }}
        </p>

        <div
          v-if="order"
          :class="[
            'mx-auto mt-6 max-w-sm rounded-lg border border-gray-200 p-4 text-left',
            'dark:border-gray-800',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-muted">{{ t('checkout.success.orderNumber') }}</span>
            <strong class="font-mono">{{ order.order_number }}</strong>
          </div>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-muted">{{ t('checkout.summary.total') }}</span>
            <span class="font-medium">{{ total }}</span>
          </div>
        </div>

        <div
          v-if="order"
          class="mx-auto mt-6 max-w-sm"
        >
          <p class="mb-2 text-sm text-muted">
            {{ t('payment.completePrompt') }}
          </p>
          <CheckoutPaymentMethods
            :order-id="order.id"
            :amount-minor="Math.round(order.total * 100)"
            :currency="order.currency"
            :order-number="order.order_number"
            :guest-token="order.guest_token"
          />
        </div>

        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <UButton
            v-if="viewOrderTo"
            color="neutral"
            variant="soft"
            :to="viewOrderTo"
            data-testid="view-order-cta"
          >
            {{ t('orders.viewOrder') }}
          </UButton>
          <UButton
            :color="order ? 'neutral' : 'primary'"
            :variant="order ? 'soft' : 'solid'"
            :to="localePath('/products')"
          >
            {{ t('cart.actions.continueShopping') }}
          </UButton>
        </div>

        <template #fallback>
          <div class="py-8 text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
