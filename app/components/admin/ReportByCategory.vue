<script setup lang="ts">
/**
 * Revenue-by-category view for the reports page. Auto-imports as
 * `<AdminReportByCategory>`. Rows arrive ranked by units desc (the backend sinks
 * the `Uncategorized` bucket — `category_id: null` — last only on unit ties), so
 * we render them in order. Revenue is per-currency and is NEVER summed across
 * currencies — each currency renders on its own line.
 */
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { CategoryRevenueRow } from '~/composables/queries/useReportQueries'

const props = defineProps<{ rows: CategoryRevenueRow[] }>()
const { t, locale } = useI18n()

/** Per-currency money map → one formatted string per currency (sorted by code). */
function moneyLines(map: Record<string, number> | undefined): string[] {
  if (!map) return []
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map(code => formatMoney(map[code] ?? 0, code as CurrencyCode, locale.value))
}

/** The null-category bucket reads "Uncategorized" from a locale key, not the API name. */
function rowName(row: CategoryRevenueRow): string {
  return row.category_id == null ? t('admin.reports.byCategory.uncategorized') : row.name
}

const hasRows = computed(() => props.rows.length > 0)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ t('admin.reports.byCategory.title') }}
      </h2>
    </template>

    <ol
      v-if="hasRows"
      class="divide-y divide-default"
    >
      <li
        v-for="row in rows"
        :key="row.category_id ?? 'uncategorized'"
        class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
      >
        <div class="flex-1 min-w-0">
          <span
            class="font-medium truncate block"
            :class="{ 'text-muted italic': row.category_id == null }"
          >
            {{ rowName(row) }}
          </span>
          <p class="text-xs text-muted tabular-nums">
            <span
              v-for="line in moneyLines(row.revenue_by_currency)"
              :key="line"
              class="mr-2"
            >{{ line }}</span>
          </p>
        </div>
        <UBadge
          color="neutral"
          variant="subtle"
          class="shrink-0 tabular-nums"
        >
          {{ t('admin.reports.byCategory.units', { count: row.units }) }}
        </UBadge>
      </li>
    </ol>

    <p
      v-else
      class="text-muted text-sm py-8 text-center"
    >
      {{ t('admin.reports.byCategory.empty') }}
    </p>
  </UCard>
</template>
