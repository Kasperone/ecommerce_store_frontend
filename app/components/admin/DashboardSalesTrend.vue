<script setup lang="ts">
/**
 * Sales-trend bar chart for the admin dashboard. Rendered with `vue-chrts`
 * (`<BarChart>`, built on Unovis — the same engine Nuxt UI lazy-loads for its
 * charts), mirroring `ReportSalesChart`.
 *
 * Bars are daily revenue in the selected currency. Revenue is never summed
 * across currencies, so when more than one currency has revenue a small picker
 * switches the series (default = the store's primary currency). Order volume is
 * surfaced per-bar via the custom tooltip slot. Zero-revenue windows render an
 * empty note rather than a flat row of nothing. Only the first/last tick is
 * shown to keep the axis uncluttered (`minMaxTicksOnly`).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart } from 'vue-chrts'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesTrendPoint } from '#shared/types/api'

interface Props {
  points: SalesTrendPoint[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  windowDays: number
}

interface ChartRow {
  date: string
  label: string
  revenue: number
  orders: number
}

const props = defineProps<Props>()
const { t, locale } = useI18n()

const selected = ref<CurrencyCode>(props.defaultCurrency)

// Guard the selection against a window switch that drops the chosen currency.
const activeCurrency = computed<CurrencyCode>(() => {
  if (props.currencies.includes(selected.value)) return selected.value
  if (props.currencies.includes(props.defaultCurrency)) return props.defaultCurrency
  return props.currencies[0] ?? props.defaultCurrency
})

const currencyItems = computed(() =>
  props.currencies.map(code => ({ label: code, value: code })),
)

function revenueFor(point: SalesTrendPoint): number {
  return point.revenue?.[activeCurrency.value] ?? 0
}

const maxRevenue = computed(() =>
  props.points.reduce((max, p) => Math.max(max, revenueFor(p)), 0),
)

const hasRevenue = computed(() => maxRevenue.value > 0)

const windowTotal = computed(() =>
  props.points.reduce((sum, p) => sum + revenueFor(p), 0),
)

function fmtDate(iso: string): string {
  // `iso` is YYYY-MM-DD; parse as UTC-noon to avoid TZ date-shift.
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
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
  props.points.map(p => ({
    date: p.date,
    label: fmtDate(p.date),
    revenue: revenueFor(p),
    orders: p.order_count,
  })),
)

// Single series; the legend would just be noise, so it's hidden.
const categories = computed(() => ({
  revenue: {
    name: t('admin.dashboardKpis.trend.revenueSeries'),
    color: 'var(--ui-primary)',
  },
}))

// Bar charts position by index, so the axis tick value IS the row index.
function xFormatter(tick: number): string {
  return chartData.value[Math.round(tick)]?.label ?? ''
}

function barLabel(row: ChartRow): string {
  return t('admin.dashboardKpis.trend.barLabel', {
    date: row.label,
    amount: fmtMoney(row.revenue),
    count: row.orders,
  })
}

const chartSummary = computed(() =>
  t('admin.dashboardKpis.trend.summary', {
    total: fmtMoney(windowTotal.value),
    days: props.windowDays,
  }),
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold">
            {{ t('admin.dashboardKpis.trend.title') }}
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
          :aria-label="t('admin.dashboardKpis.trend.currencyLabel')"
        />
      </div>
    </template>

    <div
      v-if="hasRevenue"
      class="c-trend"
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
      {{ t('admin.dashboardKpis.trend.noRevenue', { days: windowDays }) }}
    </p>
  </UCard>
</template>
