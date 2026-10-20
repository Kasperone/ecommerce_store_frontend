<script setup lang="ts">
/**
 * Top-selling products tile, ranked by units sold over revenue-status orders.
 * Each row links to the product's admin edit page; empty when nothing has sold.
 */
import { useI18n } from 'vue-i18n'
import type { TopProductItem } from '#shared/types/api'

interface Props {
  items: TopProductItem[]
}
defineProps<Props>()
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ t('admin.dashboardKpis.top.title') }}
      </h2>
    </template>

    <ol
      v-if="items.length"
      class="divide-y divide-default"
    >
      <li
        v-for="(item, index) in items"
        :key="item.product_id"
        class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
      >
        <span class="text-muted tabular-nums w-5 text-sm">{{ index + 1 }}.</span>
        <NuxtLink
          :to="localePath(`/admin/products/${item.product_id}/edit`)"
          class="flex-1 min-w-0 font-medium truncate hover:text-primary"
        >
          {{ item.name }}
        </NuxtLink>
        <span class="text-xs text-muted shrink-0">
          {{ t('admin.dashboardKpis.top.orders', { count: item.order_count }, item.order_count) }}
        </span>
        <UBadge
          color="primary"
          variant="subtle"
          class="shrink-0 tabular-nums"
        >
          {{ t('admin.dashboardKpis.top.units', { count: item.units_sold }) }}
        </UBadge>
      </li>
    </ol>

    <p
      v-else
      class="text-muted text-sm py-8 text-center"
    >
      {{ t('admin.dashboardKpis.top.empty') }}
    </p>
  </UCard>
</template>
