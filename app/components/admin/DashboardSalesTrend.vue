<script setup lang="ts">
/**
 * Sales-trend bar chart (hand-rolled — no charting dependency).
 *
 * Bars are daily revenue in the selected currency. Revenue is never summed
 * across currencies, so when more than one currency has revenue a small picker
 * switches the series (default = the store's primary currency). Order volume is
 * surfaced per-bar via the title/aria-label. Zero-revenue windows render an
 * empty note rather than a flat row of nothing.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesTrendPoint } from '#shared/types/api'

interface Props {
  points: SalesTrendPoint[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  windowDays: number
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

function heightPct(point: SalesTrendPoint): number {
  if (maxRevenue.value <= 0) return 0
  const v = revenueFor(point)
  return v > 0 ? Math.max(3, (v / maxRevenue.value) * 100) : 0
}

function fmtDate(iso: string): string {
  // `iso` is YYYY-MM-DD; parse as UTC-noon to avoid TZ date-shift.
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}

function fmtMoney(amount: number): string {
  return formatMoney(amount, activeCurrency.value, locale.value)
}

function barLabel(point: SalesTrendPoint): string {
  return t('admin.dashboardKpis.trend.barLabel', {
    date: fmtDate(point.date),
    amount: fmtMoney(revenueFor(point)),
    count: point.order_count,
  })
}

const firstDate = computed(() => (props.points[0] ? fmtDate(props.points[0].date) : ''))
const lastDate = computed(() =>
  props.points.length ? fmtDate(props.points[props.points.length - 1]!.date) : '',
)

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
    >
      <div
        class="flex items-end gap-px h-48"
        role="img"
        :aria-label="chartSummary"
      >
        <div
          v-for="point in points"
          :key="point.date"
          class="flex-1 h-full flex items-end"
        >
          <div
            data-testid="trend-bar"
            class="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
            :style="{ height: `${heightPct(point)}%` }"
            :title="barLabel(point)"
          />
        </div>
      </div>
      <div class="flex justify-between text-xs text-muted mt-2">
        <span>{{ firstDate }}</span>
        <span>{{ lastDate }}</span>
      </div>
    </div>

    <p
      v-else
      class="text-muted text-sm py-12 text-center"
    >
      {{ t('admin.dashboardKpis.trend.noRevenue', { days: windowDays }) }}
    </p>
  </UCard>
</template>
