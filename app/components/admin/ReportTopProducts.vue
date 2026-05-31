<script setup lang="ts">
/**
 * Top-selling products table for the reports page, ranked by units sold over
 * revenue-status orders in the window. Auto-imports as `<AdminReportTopProducts>`.
 *
 * Each row links to the product's admin edit page (deleted products keep their
 * snapshot name but have a null slug → no link). Revenue is per-currency and is
 * NEVER summed across currencies — each currency renders on its own line.
 */
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { TopProductRow } from '~/composables/queries/useReportQueries'

const props = defineProps<{ rows: TopProductRow[] }>()
const { t, locale } = useI18n()

/** Per-currency money map → one formatted string per currency (sorted by code). */
function moneyLines(map: Record<string, number> | undefined): string[] {
  if (!map) return []
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map(code => formatMoney(map[code] ?? 0, code as CurrencyCode, locale.value))
}

const hasRows = computed(() => props.rows.length > 0)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ t('admin.reports.topProducts.title') }}
      </h2>
    </template>

    <ol
      v-if="hasRows"
      class="divide-y divide-default"
    >
      <li
        v-for="(row, index) in rows"
        :key="row.product_id"
        class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
      >
        <span class="text-muted tabular-nums w-5 text-sm">{{ index + 1 }}.</span>
        <div class="flex-1 min-w-0">
          <NuxtLink
            v-if="row.slug"
            :to="`/admin/products/${row.product_id}/edit`"
            class="font-medium truncate hover:text-primary block"
          >
            {{ row.name }}
          </NuxtLink>
          <span
            v-else
            class="font-medium truncate block"
          >
            {{ row.name }}
          </span>
          <p class="text-xs text-muted tabular-nums">
            <span
              v-for="line in moneyLines(row.revenue_by_currency)"
              :key="line"
              class="mr-2"
            >{{ line }}</span>
          </p>
        </div>
        <span class="text-xs text-muted shrink-0">
          {{ t('admin.reports.topProducts.orders', row.order_count, { count: row.order_count }) }}
        </span>
        <UBadge
          color="primary"
          variant="subtle"
          class="shrink-0 tabular-nums"
        >
          {{ t('admin.reports.topProducts.units', { count: row.units }) }}
        </UBadge>
      </li>
    </ol>

    <p
      v-else
      class="text-muted text-sm py-8 text-center"
    >
      {{ t('admin.reports.topProducts.empty') }}
    </p>
  </UCard>
</template>
