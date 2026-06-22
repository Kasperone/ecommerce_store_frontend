<script setup lang="ts">
/**
 * Sales-trend chart for the admin dashboard. Rendered with `vue-chrts`
 * (built on Unovis — the same engine Nuxt UI lazy-loads for its charts).
 *
 * Two views the admin can toggle:
 * - **Bar** (default) — daily revenue. Zero-revenue days are mapped to `null`
 *   so Unovis renders no bar at all (a 0-height rounded bar otherwise leaves a
 *   tiny "nub" at the baseline).
 * - **Line** — a continuous linear series; zero days stay `0` so the line dips
 *   to the baseline instead of breaking.
 *
 * Revenue is never summed across currencies. A picker switches the active
 * currency, and — when more than one currency has revenue — an "All currencies"
 * option overlays one series per currency (each its own colour, with a legend)
 * so they can be compared side by side. Per-day order volume + every currency's
 * revenue surface in the custom tooltip. Only the first/last x tick shows to
 * keep the axis uncluttered (`minMaxTicksOnly`).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart, CurveType, LineChart } from 'vue-chrts'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesTrendPoint } from '#shared/types/api'

interface Props {
  points: SalesTrendPoint[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  windowDays: number
}

type CurrencySelection = CurrencyCode | 'ALL'

interface ChartRow {
  date: string
  label: string
  orders: number
  // One numeric (or null, in bar mode) key per active currency code.
  [code: string]: string | number | null
}

const props = defineProps<Props>()
const { t, locale } = useI18n()

// Distinct, theme-agnostic hues for the "all currencies" overlay. Mid-tone so
// they read on both light and dark backgrounds. Single-currency mode keeps the
// brand colour (`--ui-primary`) so it follows store customisation.
const CURRENCY_COLORS: Record<string, string> = {
  USD: '#10b981', // emerald
  PLN: '#3b82f6', // blue
  EUR: '#f59e0b', // amber
}

const chartType = ref<'bar' | 'line'>('line')
const selected = ref<CurrencySelection>(props.defaultCurrency)

const multiCurrency = computed(() => props.currencies.length > 1)
const isAll = computed(() => selected.value === 'ALL' && multiCurrency.value)

// The resolved single currency, guarded against a window switch that drops the
// chosen one (falls back to the store default, then the first available).
const singleCurrency = computed<CurrencyCode>(() => {
  const sel = selected.value
  if (sel !== 'ALL' && props.currencies.includes(sel)) return sel
  if (props.currencies.includes(props.defaultCurrency)) return props.defaultCurrency
  return props.currencies[0] ?? props.defaultCurrency
})

const activeCurrencies = computed<CurrencyCode[]>(() =>
  isAll.value ? props.currencies : [singleCurrency.value],
)

const currencyItems = computed(() => {
  const items: { label: string, value: CurrencySelection }[] = props.currencies.map(code => ({
    label: code,
    value: code,
  }))
  if (multiCurrency.value) {
    items.push({ label: t('admin.dashboardKpis.trend.allCurrencies'), value: 'ALL' })
  }
  return items
})

const chartTypeItems = computed(() => [
  { value: 'bar' as const, icon: 'i-lucide-chart-column', label: t('admin.dashboardKpis.trend.barChart') },
  { value: 'line' as const, icon: 'i-lucide-chart-line', label: t('admin.dashboardKpis.trend.lineChart') },
])

const maxRevenue = computed(() => {
  let max = 0
  for (const p of props.points) {
    for (const code of activeCurrencies.value) {
      max = Math.max(max, p.revenue?.[code] ?? 0)
    }
  }
  return max
})

const hasRevenue = computed(() => maxRevenue.value > 0)

const windowTotal = computed(() =>
  props.points.reduce((sum, p) => sum + (p.revenue?.[singleCurrency.value] ?? 0), 0),
)

function fmtDate(iso: string): string {
  // `iso` is YYYY-MM-DD; parse as UTC-noon to avoid a TZ date-shift.
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}

function fmtMoney(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency, locale.value)
}

// Compact axis labels — a currency symbol when a single currency owns the axis,
// a plain compact number when several currencies share it.
function yFormatter(tick: number): string {
  if (isAll.value) {
    return new Intl.NumberFormat(locale.value, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(tick)
  }
  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: singleCurrency.value,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(tick)
}

const chartData = computed<ChartRow[]>(() =>
  props.points.map((p) => {
    const row: ChartRow = { date: p.date, label: fmtDate(p.date), orders: p.order_count }
    for (const code of activeCurrencies.value) {
      const rev = p.revenue?.[code] ?? 0
      // Bar mode: drop zero bars (null = no rect) so the baseline stays clean.
      // Line mode: keep the real 0 so the series stays continuous.
      row[code] = chartType.value === 'bar' && rev === 0 ? null : rev
    }
    return row
  }),
)

const categories = computed<Record<string, { name: string, color: string }>>(() => {
  if (!isAll.value) {
    return {
      [singleCurrency.value]: {
        name: t('admin.dashboardKpis.trend.revenueSeries'),
        color: 'var(--ui-primary)',
      },
    }
  }
  return Object.fromEntries(
    activeCurrencies.value.map(code => [
      code,
      { name: code, color: CURRENCY_COLORS[code] ?? 'var(--ui-primary)' },
    ]),
  )
})

function colorFor(code: CurrencyCode): string {
  return categories.value[code]?.color ?? 'var(--ui-primary)'
}

// Bar charts position by index, so the axis tick value IS the row index.
function xFormatter(tick: number): string {
  return chartData.value[Math.round(tick)]?.label ?? ''
}

// Component + extra props that differ between the two chart types.
const activeChart = computed(() => (chartType.value === 'bar' ? BarChart : LineChart))
const chartTypeProps = computed(() =>
  chartType.value === 'bar'
    // radius: 0 — a rounded corner on a 0-height bar leaves a visible "nub" at
    // the baseline for every zero-revenue day (Unovis draws one bar per datum
    // regardless of value), so square tops keep the baseline clean.
    ? { yAxis: activeCurrencies.value, radius: 0, barPadding: 0.3 }
    : { curveType: CurveType.Linear, lineWidth: 2 },
)

const chartSummary = computed(() =>
  isAll.value
    ? t('admin.dashboardKpis.trend.summaryAll', { days: props.windowDays })
    : t('admin.dashboardKpis.trend.summary', {
        total: fmtMoney(windowTotal.value, singleCurrency.value),
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
        <div class="flex items-center gap-2">
          <UButtonGroup size="sm">
            <UButton
              v-for="opt in chartTypeItems"
              :key="opt.value"
              :icon="opt.icon"
              :color="chartType === opt.value ? 'primary' : 'neutral'"
              :variant="chartType === opt.value ? 'solid' : 'outline'"
              :aria-label="opt.label"
              :aria-pressed="chartType === opt.value"
              @click="chartType = opt.value"
            />
          </UButtonGroup>
          <USelect
            v-if="multiCurrency"
            v-model="selected"
            :items="currencyItems"
            value-key="value"
            size="sm"
            class="w-36"
            :aria-label="t('admin.dashboardKpis.trend.currencyLabel')"
          />
        </div>
      </div>
    </template>

    <div
      v-if="hasRevenue"
      class="c-trend"
      role="img"
      :aria-label="chartSummary"
    >
      <component
        :is="activeChart"
        :data="chartData"
        :height="200"
        :categories="categories"
        :x-formatter="xFormatter"
        :y-formatter="yFormatter"
        :min-max-ticks-only="true"
        :hide-legend="!isAll"
        v-bind="chartTypeProps"
      >
        <template #tooltip="{ values }">
          <div
            v-if="values"
            class="rounded-md bg-default ring ring-default px-3 py-2 text-xs shadow-lg"
          >
            <p class="font-medium text-default mb-1">
              {{ (values as ChartRow).label }}
            </p>
            <div class="space-y-1">
              <p
                v-for="code in activeCurrencies"
                :key="code"
                class="flex items-center gap-1.5"
              >
                <span
                  class="inline-block w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: colorFor(code) }"
                />
                <span class="text-default font-medium tabular-nums">
                  {{ fmtMoney(Number((values as ChartRow)[code] ?? 0), code) }}
                </span>
                <span
                  v-if="isAll"
                  class="text-muted"
                >{{ code }}</span>
              </p>
              <p class="text-muted">
                {{ t('admin.dashboardKpis.trend.ordersLine', {
                  count: Number((values as ChartRow).orders),
                }) }}
              </p>
            </div>
          </div>
        </template>
      </component>
    </div>

    <p
      v-else
      class="text-muted text-sm py-12 text-center"
    >
      {{ t('admin.dashboardKpis.trend.noRevenue', { days: windowDays }) }}
    </p>
  </UCard>
</template>

<style scoped>
/* Flatten Unovis's own tooltip container so only our themed box renders — kills
   the double border, and the default light background that otherwise showed
   through in dark mode. The emotion class is hashed, hence the suffix match. */
.c-trend :deep([class*='-tooltip']) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}
</style>
