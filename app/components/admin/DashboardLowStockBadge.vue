<script setup lang="ts">
/**
 * Compact dashboard tile surfacing the store-wide low-stock + out-of-stock
 * counts from `GET /api/v1/admin/inventory/low-stock-summary`, deep-linking to
 * the inventory list pre-filtered to `?status=low_stock`. Self-fetches (the
 * dashboard KPIs query doesn't carry the threshold-aware summary), so it's wrapped
 * in <ClientOnly> by the caller per the SSR-hydration rule.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const localePath = useLocalePath()
const { data: summary } = useLowStockSummary()

const lowCount = computed(() => summary.value?.low_stock_count ?? 0)
const outCount = computed(() => summary.value?.out_of_stock_count ?? 0)
const hasAlerts = computed(() => lowCount.value > 0 || outCount.value > 0)

const lowStockLink = computed(() => ({
  path: localePath('/admin/inventory'),
  query: { status: 'low_stock' },
}))
const outOfStockLink = computed(() => ({
  path: localePath('/admin/inventory'),
  query: { status: 'out_of_stock' },
}))
</script>

<template>
  <UCard data-testid="dashboard-low-stock-badge">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold">
          {{ t('admin.inventory.lowStock.badge.title') }}
        </h2>
        <UBadge
          v-if="hasAlerts"
          color="warning"
          variant="solid"
          class="tabular-nums"
        >
          {{ lowCount + outCount }}
        </UBadge>
      </div>
    </template>

    <div class="grid grid-cols-2 gap-6">
      <NuxtLink
        :to="lowStockLink"
        class="rounded-lg p-3 -ml-3 -my-3 hover:bg-elevated/50 transition-colors"
      >
        <p class="text-2xl font-bold tabular-nums text-warning">
          {{ lowCount }}
        </p>
        <p class="text-sm text-muted mt-1">
          {{ t('admin.inventory.lowStock.badge.lowStock', { count: lowCount }) }}
        </p>
      </NuxtLink>
      <NuxtLink
        :to="outOfStockLink"
        class="rounded-lg p-3 -mr-3 -my-3 hover:bg-elevated/50 transition-colors"
      >
        <p class="text-2xl font-bold tabular-nums text-error">
          {{ outCount }}
        </p>
        <p class="text-sm text-muted mt-1">
          {{ t('admin.inventory.lowStock.badge.outOfStock', { count: outCount }) }}
        </p>
      </NuxtLink>
    </div>

    <template #footer>
      <ULink
        :to="lowStockLink"
        class="text-primary text-sm"
      >
        {{ t('admin.inventory.lowStock.badge.viewAll') }}
      </ULink>
    </template>
  </UCard>
</template>
