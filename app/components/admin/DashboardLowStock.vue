<script setup lang="ts">
/**
 * Low-stock tile: products whose computed status is not `in_stock`, most-urgent
 * first. Reuses the inventory status labels/colors. Links to the full inventory
 * list, and notes how many more rows aren't shown.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LowStockItem } from '#shared/types/api'

type Status = LowStockItem['status']

interface Props {
  items: LowStockItem[]
  count: number
}
const props = defineProps<Props>()
const { t } = useI18n()
const localePath = useLocalePath()

const STATUS_COLOR: Record<Status, 'success' | 'warning' | 'error' | 'info'> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'error',
  backorder: 'info',
}

const moreCount = computed(() => Math.max(0, props.count - props.items.length))
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold">
          {{ t('admin.dashboardKpis.low.title') }}
        </h2>
        <UBadge
          v-if="count > 0"
          color="warning"
          variant="subtle"
          class="tabular-nums"
        >
          {{ count }}
        </UBadge>
      </div>
    </template>

    <ul
      v-if="items.length"
      class="divide-y divide-default"
    >
      <li
        v-for="item in items"
        :key="item.product_id"
        class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
      >
        <NuxtLink
          :to="localePath(`/admin/products/${item.product_id}/edit`)"
          class="flex-1 min-w-0 font-medium truncate hover:text-primary"
        >
          {{ item.name }}
        </NuxtLink>
        <span class="text-sm text-muted tabular-nums shrink-0">
          {{ t('admin.dashboardKpis.low.stock', { count: item.stock }) }}
        </span>
        <UBadge
          :color="STATUS_COLOR[item.status]"
          variant="subtle"
          class="shrink-0"
        >
          {{ t(`admin.inventory.status.${item.status}`) }}
        </UBadge>
      </li>
    </ul>

    <p
      v-else
      class="text-muted text-sm py-8 text-center"
    >
      {{ t('admin.dashboardKpis.low.empty') }}
    </p>

    <template
      v-if="items.length"
      #footer
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <span
          v-if="moreCount > 0"
          class="text-muted"
        >
          {{ t('admin.dashboardKpis.low.more', { count: moreCount }) }}
        </span>
        <span v-else />
        <ULink
          :to="localePath('/admin/inventory')"
          class="text-primary"
        >
          {{ t('admin.dashboardKpis.low.viewAll') }}
        </ULink>
      </div>
    </template>
  </UCard>
</template>
