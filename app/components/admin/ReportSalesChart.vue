<script setup lang="ts">
/**
 * Sales-over-time bar chart for the reports page (hand-rolled — no charting dep,
 * mirrors `DashboardSalesTrend`). Auto-imports as `<AdminReportSalesChart>`.
 *
 * Bars are per-bucket revenue in the selected currency. Revenue is NEVER summed
 * across currencies, so when more than one currency has revenue a small picker
 * switches the series (default = the store's primary currency). Order volume is
 * surfaced per-bar via the title/aria-label. A zero-revenue range renders an
 * empty note. Bucket labels adapt to granularity (day → "Jan 5", month → "Jan
 * 2026", week → "Week of Jan 5").
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesBucket } from '~/composables/queries/useReportQueries'

interface Props {
  buckets: SalesBucket[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  granularity: 'day' | 'week' | 'month'
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

function heightPct(bucket: SalesBucket): number {
  if (maxRevenue.value <= 0) return 0
  const v = revenueFor(bucket)
  return v > 0 ? Math.max(3, (v / maxRevenue.value) * 100) : 0
}

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

function barLabel(bucket: SalesBucket): string {
  return t('admin.reports.chart.barLabel', {
    bucket: fmtBucket(bucket.bucket),
    amount: fmtMoney(revenueFor(bucket)),
    count: bucket.orders,
  })
}

const firstBucket = computed(() => (props.buckets[0] ? fmtBucket(props.buckets[0].bucket) : ''))
const lastBucket = computed(() =>
  props.buckets.length ? fmtBucket(props.buckets[props.buckets.length - 1]!.bucket) : '',
)

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
    >
      <div
        class="flex items-end gap-px h-48"
        role="img"
        :aria-label="chartSummary"
      >
        <div
          v-for="bucket in buckets"
          :key="bucket.bucket"
          class="flex-1 h-full flex items-end"
        >
          <div
            data-testid="report-bar"
            class="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
            :style="{ height: `${heightPct(bucket)}%` }"
            :title="barLabel(bucket)"
          />
        </div>
      </div>
      <div class="flex justify-between text-xs text-muted mt-2">
        <span>{{ firstBucket }}</span>
        <span>{{ lastBucket }}</span>
      </div>
    </div>

    <p
      v-else
      class="text-muted text-sm py-12 text-center"
    >
      {{ t('admin.reports.chart.noRevenue') }}
    </p>
  </UCard>
</template>
