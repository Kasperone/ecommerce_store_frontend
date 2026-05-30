<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

definePageMeta({ middleware: 'user' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const id = computed(() => {
  const n = Number(route.params.id)
  return Number.isInteger(n) && n > 0 ? n : undefined
})

const { data: order, error } = useOrderQuery(id)
const cancelMutation = useCancelOrder()

const cancelOpen = ref(false)
const cancelError = ref<ProblemDetails | null>(null)

const canCancel = computed(() => order.value?.status === 'pending')
const canPay = computed(() => order.value?.status === 'pending')

function money(value: number) {
  return order.value ? formatMoney(value, order.value.currency as CurrencyCode, locale.value) : ''
}

async function confirmCancel() {
  if (!id.value) return
  cancelError.value = null
  try {
    await cancelMutation.mutateAsync(id.value)
    cancelOpen.value = false
  }
  catch (err) {
    cancelError.value = parseProblem(err)
  }
}

useHead({
  title: () => (order.value ? t('orders.detail.title', { number: order.value.order_number }) : t('orders.title')),
})
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-3xl px-4 py-8">
      <NuxtLink
        :to="localePath('/account/orders')"
        class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('orders.back') }}
      </NuxtLink>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <div
        v-else-if="!order"
        class="py-12 text-center text-muted"
      >
        {{ t('actions.loading') }}
      </div>

      <div
        v-else
        class="space-y-6"
      >
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">
              {{ t('orders.detail.title', { number: order.order_number }) }}
            </h1>
            <p class="text-sm text-muted">
              {{
                t('orders.detail.placedOn', {
                  date: new Date(order.created_at).toLocaleDateString(locale),
                })
              }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <OrdersStatusBadge :status="order.status" />
            <OrdersInvoiceDownloadButton
              :order-id="order.id"
              :order-number="order.order_number"
              size="sm"
            />
            <UButton
              v-if="canCancel"
              color="error"
              variant="soft"
              size="sm"
              @click="cancelOpen = true; cancelError = null"
            >
              {{ t('orders.cancel.button') }}
            </UButton>
          </div>
        </header>

        <div
          v-if="canPay"
          class="rounded-lg border border-primary/30 bg-primary/5 p-4 dark:bg-primary/10"
        >
          <p class="mb-3 text-sm font-medium">
            {{ t('payment.completePrompt') }}
          </p>
          <CheckoutPaymentMethods
            :order-id="order.id"
            :amount-minor="Math.round(order.total * 100)"
            :currency="order.currency"
            :order-number="order.order_number"
          />
        </div>

        <OrdersRefundsSection
          :refunds="order.refunds ?? []"
          :currency="order.currency"
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
              v-for="item in order.items"
              :key="item.id"
              class="flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p class="font-medium">
                  {{ item.product_name }}
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
          <section>
            <h2 class="mb-2 font-semibold">
              {{ t('orders.detail.shippingAddress') }}
            </h2>
            <address class="text-sm not-italic text-muted">
              {{ order.shipping_address }}<br>
              {{ order.shipping_postal_code }} {{ order.shipping_city }}<br>
              {{ order.shipping_country }}
            </address>
            <p
              v-if="order.notes"
              class="mt-3 text-sm"
            >
              <span class="text-muted">{{ t('orders.detail.notes') }}:</span> {{ order.notes }}
            </p>
          </section>

          <section class="h-fit rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div class="flex justify-between py-1 text-sm">
              <span class="text-muted">{{ t('orders.detail.subtotal') }}</span>
              <span>{{ money(order.subtotal) }}</span>
            </div>
            <div class="flex justify-between py-1 text-sm">
              <span class="text-muted">{{ t('orders.detail.tax') }}</span>
              <span>{{ money(order.tax) }}</span>
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
      </div>
    </div>

    <UModal
      v-model:open="cancelOpen"
      :title="t('orders.cancel.title')"
      :description="t('orders.cancel.body')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            @click="cancelOpen = false"
          >
            {{ t('orders.cancel.dismiss') }}
          </UButton>
          <UButton
            color="error"
            :loading="cancelMutation.isLoading.value"
            @click="confirmCancel"
          >
            {{ t('orders.cancel.confirm') }}
          </UButton>
        </div>
      </template>
      <template #body>
        <ErrorAlert
          v-if="cancelError"
          :problem="cancelError"
        />
      </template>
    </UModal>
  </NuxtLayout>
</template>
