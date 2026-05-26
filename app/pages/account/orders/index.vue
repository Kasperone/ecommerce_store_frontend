<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({ middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('orders.title') })

const page = ref(1)
const { data, error } = useOrdersQuery(computed(() => ({ page: page.value, pageSize: 10 })))

const orders = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageSize = computed(() => data.value?.page_size ?? 10)

function placedOn(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value)
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
        <ul class="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          <li
            v-for="order in orders"
            :key="order.id"
          >
            <NuxtLink
              :to="localePath(`/account/orders/${order.id}`)"
              class="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <div class="flex flex-col gap-1">
                <span class="font-mono font-medium">{{ order.order_number }}</span>
                <span class="text-xs text-muted">{{ t('orders.fields.placed') }}: {{ placedOn(order.created_at) }} · {{ order.item_count }} {{ t('orders.fields.items') }}</span>
              </div>
              <div class="flex items-center gap-4">
                <OrdersStatusBadge :status="order.status" />
                <span class="font-medium">{{ formatMoney(order.total, order.currency as CurrencyCode, locale) }}</span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-muted"
                />
              </div>
            </NuxtLink>
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
