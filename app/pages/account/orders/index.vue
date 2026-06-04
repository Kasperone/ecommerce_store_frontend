<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { OrderWithUser } from '#shared/types/api'

definePageMeta({ layout: 'account', middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { apiFetch } = useApi()
const toast = useToast()
const { reorder } = useReorder()

useHead({ title: () => t('orders.title') })

const page = ref(1)
const { data, error } = useOrdersQuery(computed(() => ({ page: page.value, pageSize: 10 })))

const orders = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageSize = computed(() => data.value?.page_size ?? 10)

function placedOn(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value)
}

// List rows (`OrderListItem`) carry no line items, so "Buy again" fetches the
// order detail first, then re-resolves each line's current product/price/stock.
const reorderingId = ref<number | null>(null)

async function onReorder(orderId: number) {
  reorderingId.value = orderId
  try {
    const detail = await apiFetch<OrderWithUser>(`/api/v1/orders/${orderId}`)
    await reorder(
      detail.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: item.product_name,
      })),
    )
  }
  catch {
    toast.add({
      title: t('orders.reorder.toast.noneTitle'),
      description: t('orders.reorder.toast.none'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    reorderingId.value = null
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-4xl px-4 py-8">
      <header class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('orders.title') }}
        </h1>
        <p class="text-muted text-sm">
          {{ t('orders.subtitle') }}
        </p>
      </header>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <div
        v-else-if="!data"
        class="py-12 text-center text-muted"
      >
        {{ t('actions.loading') }}
      </div>

      <div
        v-else-if="orders.length === 0"
        class="flex flex-col items-center gap-4 py-16 text-center"
      >
        <UIcon
          name="i-lucide-package"
          class="size-12 text-muted"
        />
        <p class="text-muted">
          {{ t('orders.empty') }}
        </p>
        <UButton
          color="primary"
          :to="localePath('/products')"
        >
          {{ t('orders.emptyCta') }}
        </UButton>
      </div>

      <template v-else>
        <ul
          :class="[
            'divide-y divide-gray-100 rounded-lg border border-gray-200',
            'dark:divide-gray-800 dark:border-gray-800',
          ]"
        >
          <li
            v-for="order in orders"
            :key="order.id"
            :class="[
              'flex flex-wrap items-center justify-between gap-3 p-4',
              'hover:bg-gray-50 dark:hover:bg-gray-900',
            ]"
          >
            <NuxtLink
              :to="localePath(`/account/orders/${order.id}`)"
              class="flex min-w-0 flex-1 flex-col gap-1"
            >
              <span class="font-mono font-medium">{{ order.order_number }}</span>
              <span class="text-xs text-muted">
                {{ t('orders.fields.placed') }}: {{ placedOn(order.created_at) }}
                · {{ order.item_count }} {{ t('orders.fields.items') }}
              </span>
            </NuxtLink>
            <div class="flex items-center gap-4">
              <OrdersStatusBadge :status="order.status" />
              <span class="font-medium">
                {{ formatMoney(order.total, order.currency as CurrencyCode, locale) }}
              </span>
              <UButton
                color="primary"
                variant="soft"
                size="xs"
                icon="i-lucide-repeat"
                :loading="reorderingId === order.id"
                :aria-label="t('orders.reorder.button')"
                @click="onReorder(order.id)"
              >
                {{ t('orders.reorder.button') }}
              </UButton>
              <NuxtLink
                :to="localePath(`/account/orders/${order.id}`)"
                :aria-label="t('orders.viewOrder')"
              >
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-muted"
                />
              </NuxtLink>
            </div>
          </li>
        </ul>

        <UPagination
          v-if="total > pageSize"
          :total="total"
          :items-per-page="pageSize"
          :page="page"
          class="mt-4 flex justify-center"
          @update:page="(p) => page = p"
        />
      </template>
    </div>
  </NuxtLayout>
</template>
