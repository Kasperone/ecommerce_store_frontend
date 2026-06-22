<script setup lang="ts">
/**
 * Sales-over-time bar chart for the reports page. Rendered with `vue-chrts`
 * (`<BarChart>`, built on Unovis — the same engine Nuxt UI lazy-loads for its
 * charts). Auto-imports as `<AdminReportSalesChart>`.
 *
 * Bars are per-bucket revenue in the selected currency. Revenue is NEVER summed
 * across currencies, so when more than one currency has revenue a small picker
 * switches the series (default = the store's primary currency). Order volume is
 * surfaced per-bar via the custom tooltip slot. A zero-revenue range renders an
 * empty note. Bucket labels adapt to granularity (day → "Jan 5", month → "Jan
 * 2026", week → "Week of Jan 5") and only the first/last tick is shown to keep
 * the axis uncluttered (`minMaxTicksOnly`).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart } from 'vue-chrts'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesBucket } from '~/composables/queries/useReportQueries'

interface Props {
  buckets: SalesBucket[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  granularity: 'day' | 'week' | 'month'
}

interface ChartRow {
  bucket: string
  label: string
  revenue: number
  orders: number
}

const props = defineProps<Props>()
const { t, locale } = useI18n()

const selected = ref<CurrencyCode>(props.defaultCurrency)

// Guard the selection against a range switch that drops the chosen currency.
const activeCurrency = computed<CurrencyCode>(() => {
  if (props.currencies.includes(selected.value)) return selected.value
  if (props.currencies.includes(props.defaultCurrency)) return props.defaultCurrency
  return props.currencies[0] ?? props.defaultCurrency
})

const currencyItems = computed(() =>
  props.currencies.map(code => ({ label: code, value: code })),
)

function revenueFor(bucket: SalesBucket): number {
  return bucket.revenue?.[activeCurrency.value] ?? 0
}

const maxRevenue = computed(() =>
  props.buckets.reduce((max, b) => Math.max(max, revenueFor(b)), 0),
)

const hasRevenue = computed(() => maxRevenue.value > 0)

const rangeTotal = computed(() =>
  props.buckets.reduce((sum, b) => sum + revenueFor(b), 0),
)

function fmtBucket(iso: string): string {
  // `iso` is YYYY-MM-DD; parse as UTC-noon to avoid a TZ date-shift.
  const d = new Date(`${iso}T12:00:00`)
  if (props.granularity === 'month') {
    return d.toLocaleDateString(locale.value, { month: 'short', year: 'numeric' })
  }
  const day = d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
  if (props.granularity === 'week') {
    return t('admin.reports.chart.weekOf', { date: day })
  }
  return day
}

function fmtMoney(amount: number): string {
  return formatMoney(amount, activeCurrency.value, locale.value)
}

// Compact axis money (e.g. "$1.2K") — full values live in the tooltip.
function fmtAxisMoney(amount: number): string {
  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: activeCurrency.value,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

const chartData = computed<ChartRow[]>(() =>
  props.buckets.map(b => ({
    bucket: b.bucket,
    label: fmtBucket(b.bucket),
    revenue: revenueFor(b),
    orders: b.orders,
  })),
)

// Single series; the legend would just be noise, so it's hidden.
const categories = computed(() => ({
  revenue: {
    name: t('admin.reports.chart.revenueSeries'),
    color: 'var(--ui-primary)',
  },
}))

// Bar charts position by index, so the axis tick value IS the row index.
function xFormatter(tick: number): string {
  return chartData.value[Math.round(tick)]?.label ?? ''
}

function barLabel(row: ChartRow): string {
  return t('admin.reports.chart.barLabel', {
    bucket: row.label,
    amount: fmtMoney(row.revenue),
    count: row.orders,
  })
}

const chartSummary = computed(() =>
  t('admin.reports.chart.summary', { total: fmtMoney(rangeTotal.value) }),
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold">
            {{ t('admin.reports.chart.title') }}
          </h2>
          <p class="text-sm text-muted">
            {{ chartSummary }}
          </p>
        </div>
        <USelect
          v-if="currencyItems.length > 1"
          v-model="selected"
          :items="currencyItems"
          value-key="value"
          size="sm"
          class="w-28"
          :aria-label="t('admin.reports.chart.currencyLabel')"
        />
      </div>
    </template>

    <div
      v-if="hasRevenue"
      class="c-report-chart"
      role="img"
      :aria-label="chartSummary"
    >
      <BarChart
        :data="chartData"
        :height="192"
        :categories="categories"
        :y-axis="['revenue']"
        :x-formatter="xFormatter"
        :y-formatter="(tick: number) => fmtAxisMoney(tick)"
        :min-max-ticks-only="true"
        :radius="2"
        hide-legend
      >
        <template #tooltip="{ values }">
          <div
            v-if="values"
            class="rounded-md bg-default ring ring-default px-2.5 py-1.5 text-xs shadow-lg"
          >
            <p class="font-medium">
              {{ values.label }}
            </p>
            <p class="text-muted">
              {{ barLabel(values as ChartRow) }}
            </p>
          </div>
        </template>
      </BarChart>
    </div>

    <p
      v-else
      class="text-muted text-sm py-12 text-center"
    >
      {{ t('admin.reports.chart.noRevenue') }}
    </p>
  </UCard>
</template>

<style scoped>
/* Flatten Unovis's own tooltip container so only our themed box renders — kills
   the double border, and the default light background that otherwise showed
   through in dark mode. The emotion class is hashed, hence the suffix match. */
.c-report-chart :deep([class*='-tooltip']) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}
</style>
