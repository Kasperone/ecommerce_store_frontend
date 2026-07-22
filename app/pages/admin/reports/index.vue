<script setup lang="ts">
import { computed } from 'vue'
import { z } from 'zod'
import { useI18n } from 'vue-i18n'
import type { CurrencyCode } from '#shared/utils/money'
import { defaultCurrencyForLocale } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
useHead({
  title: () => t('admin.reports.title'),
  titleTemplate: '%s | Admin',
})

type Granularity = 'day' | 'week' | 'month'

/** ISO `YYYY-MM-DD` for a date `daysAgo` days before today (UTC). */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

// Default to the trailing 30 days so the sales chart has data on first load
// (the /sales endpoint requires both start and end).
const DEFAULT_START = isoDaysAgo(29)
const DEFAULT_END = isoDaysAgo(0)

const filterSchema = z.object({
  // ISO `YYYY-MM-DD`; strings round-trip from the URL with no coercion. A filter
  // key MUST live in BOTH the schema AND `defaults` — useUrlFilters iterates
  // `Object.keys(defaults)`, so a schema-only key is silently dropped.
  start: z.string().optional(),
  end: z.string().optional(),
  granularity: z.enum(['day', 'week', 'month']).optional(),
})

const defaults = {
  start: DEFAULT_START as string | undefined,
  end: DEFAULT_END as string | undefined,
  granularity: 'day' as Granularity,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const start = computed(() => filters.value.start ?? DEFAULT_START)
const end = computed(() => filters.value.end ?? DEFAULT_END)
const granularity = computed<Granularity>(() => filters.value.granularity ?? 'day')

const rangeParams = computed(() => ({ start: start.value, end: end.value }))
const salesParams = computed(() => ({
  start: start.value,
  end: end.value,
  granularity: granularity.value,
}))
const topProductsParams = computed(() => ({ start: start.value, end: end.value, limit: 10 }))

const { data: sales, error: salesError } = useSalesReport(salesParams)
const { data: topProducts, error: topError } = useTopProductsReport(topProductsParams)
const { data: byCategory, error: categoryError } = useCategoryRevenueReport(rangeParams)
const { data: refunds, error: refundError } = useRefundSummaryReport(rangeParams)
// EU distance-selling threshold — a calendar-year compliance figure, not range-filtered.
const { data: euThreshold } = useEuDistanceSellingStatus()

// Surface the first error across the four aggregates (a 403 hits them all).
const firstError = computed(
  () => salesError.value || topError.value || categoryError.value || refundError.value,
)

const loading = computed(
  () =>
    !firstError.value
    && !sales.value
    && !topProducts.value
    && !byCategory.value
    && !refunds.value,
)

/** Currencies that have any revenue in the sales buckets (for the chart picker). */
const chartCurrencies = computed<CurrencyCode[]>(() => {
  const set = new Set<string>()
  for (const bucket of sales.value?.buckets ?? []) {
    for (const code of Object.keys(bucket.revenue ?? {})) set.add(code)
  }
  return [...set] as CurrencyCode[]
})

const defaultCurrency = computed<CurrencyCode>(() => defaultCurrencyForLocale(locale.value))

function onStartChange(value: string | undefined) {
  set({ start: value })
}
function onEndChange(value: string | undefined) {
  set({ end: value })
}
function onGranularityChange(value: Granularity) {
  set({ granularity: value })
}
</script>

<template>
  <NuxtLayout>
    <div class="c-admin-reports space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('admin.reports.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ t('admin.reports.subtitle') }}
          </p>
        </div>
        <div class="flex items-end gap-3 flex-wrap">
          <AdminReportFilters
            :start="filters.start"
            :end="filters.end"
            :granularity="granularity"
            @update:start="onStartChange"
            @update:end="onEndChange"
            @update:granularity="onGranularityChange"
          />
          <AdminReportExportButton
            :start="start"
            :end="end"
            :granularity="granularity"
          />
        </div>
      </header>

      <ErrorAlert
        v-if="firstError"
        :problem="parseProblem(firstError)"
      />

      <template v-else-if="loading">
        <USkeleton class="h-64" />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <USkeleton class="h-56" />
          <USkeleton class="h-56" />
        </div>
        <USkeleton class="h-40" />
      </template>

      <template v-else>
        <AdminReportSalesChart
          v-if="sales"
          :buckets="sales.buckets"
          :currencies="chartCurrencies"
          :default-currency="defaultCurrency"
          :granularity="granularity"
        />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminReportTopProducts :rows="topProducts?.rows ?? []" />
          <AdminReportByCategory :rows="byCategory?.rows ?? []" />
        </div>

        <AdminReportRefundSummary
          :refund-count="refunds?.refund_count ?? 0"
          :rows="refunds?.rows ?? []"
        />

        <AdminReportEuThreshold
          v-if="euThreshold"
          :status="euThreshold"
        />
      </template>
    </div>
  </NuxtLayout>
</template>
