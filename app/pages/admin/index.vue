<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type DateValue, getLocalTimeZone, today } from '@internationalized/date'
import dayjs from 'dayjs'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
useHead({
  title: () => t('admin.dashboardKpis.title'),
  titleTemplate: '%s | Admin',
})

// The dashboard's windowed figures default to a *trailing window* ending today
// (a preset: 7/30/90 days, mapped onto the backend's `window_days` contract). The
// admin can instead pick a "Custom" from→to range; the calendar only appears once
// Custom is selected, and the picked `[start, end]` is sent as `start_date`/`end_date`
// (the backend then reports the effective span back as `window_days`).
const MAX_RANGE_DAYS = 365 // keeps the request within the backend's 366-day cap
const tz = getLocalTimeZone()
const todayValue = today(tz)
const minValue = todayValue.subtract({ days: MAX_RANGE_DAYS - 1 })

type CalRange = { start: DateValue | null, end: DateValue | null }

const mode = ref<'preset' | 'custom'>('preset')
const windowDays = ref(30)
// Seeded so the calendar opens on a sensible range; reseeded from the active preset
// each time Custom is (re)entered.
const customRange = ref<CalRange>({ start: todayValue.subtract({ days: 29 }), end: todayValue })

const presets = computed(() => [
  { value: 7, label: t('admin.dashboardKpis.window.preset7') },
  { value: 30, label: t('admin.dashboardKpis.window.preset30') },
  { value: 90, label: t('admin.dashboardKpis.window.preset90') },
])

const rangeComplete = computed(() => !!(customRange.value.start && customRange.value.end))

// Inclusive day span of the picked range (0 until both ends are chosen).
const customDays = computed(() => {
  const { start, end } = customRange.value
  if (!start || !end) return 0
  return dayjs(end.toDate(tz)).startOf('day').diff(dayjs(start.toDate(tz)).startOf('day'), 'day') + 1
})

function fmtCalDate(d: DateValue): string {
  return d.toDate(tz).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function selectPreset(value: number) {
  mode.value = 'preset'
  windowDays.value = value
}

function selectCustom() {
  // Reseed the range from the current trailing window so it opens where the admin left off.
  if (mode.value !== 'custom') {
    customRange.value = { start: todayValue.subtract({ days: windowDays.value - 1 }), end: todayValue }
  }
  mode.value = 'custom'
}

const periodLabel = computed(() => {
  if (mode.value === 'custom') {
    const { start, end } = customRange.value
    return start && end
      ? t('admin.dashboardKpis.window.customRangeLabel', {
          from: fmtCalDate(start),
          to: fmtCalDate(end),
        })
      : t('admin.dashboardKpis.window.presetCustom')
  }
  switch (windowDays.value) {
    case 7: return t('admin.dashboardKpis.window.last7')
    case 90: return t('admin.dashboardKpis.window.last90')
    default: return t('admin.dashboardKpis.window.last30')
  }
})

// A complete custom range sends start_date/end_date; otherwise the trailing window.
const params = computed<DashboardKpisParams>(() => {
  if (mode.value === 'custom' && customRange.value.start && customRange.value.end) {
    return {
      startDate: customRange.value.start.toString(),
      endDate: customRange.value.end.toString(),
    }
  }
  return { windowDays: windowDays.value }
})
const { data: kpis, error, status, asyncStatus } = useDashboardKpis(params)
// Skeleton only on the genuine first load (no data has ever arrived). Once we have
// data, `placeholderData` keeps the previous window's figures on screen across a
// range/preset change, so we never flash the skeleton again — a background refetch
// just dims the live content via `refreshing`.
const initialLoading = computed(() => status.value === 'pending' && !error.value)
const refreshing = computed(
  () => asyncStatus.value === 'loading' && status.value !== 'pending',
)

/** Per-currency money map → formatted entries, primary currency first. */
function moneyEntries(map: Record<string, number> | undefined) {
  if (!map) return [] as { currency: CurrencyCode, formatted: string }[]
  const primary = kpis.value?.primary_currency
  return Object.keys(map)
    .sort((a, b) => {
      if (a === primary) return -1
      if (b === primary) return 1
      return a.localeCompare(b)
    })
    .map(code => ({
      currency: code as CurrencyCode,
      formatted: formatMoney(map[code] ?? 0, code as CurrencyCode, locale.value),
    }))
}

const revenueEntries = computed(() => moneyEntries(kpis.value?.revenue_total))
const aovEntries = computed(() => moneyEntries(kpis.value?.aov_total))

/** Currencies that actually have bars in the windowed trend. */
const trendCurrencies = computed<CurrencyCode[]>(() => {
  const set = new Set<string>()
  for (const point of kpis.value?.sales_trend ?? []) {
    for (const code of Object.keys(point.revenue ?? {})) set.add(code)
  }
  return [...set] as CurrencyCode[]
})

const primaryCurrency = computed<CurrencyCode>(
  () => (kpis.value?.primary_currency as CurrencyCode) ?? 'USD',
)
</script>

<template>
  <NuxtLayout>
    <div class="c-admin-dashboard space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('admin.dashboardKpis.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ t('admin.dashboardKpis.subtitle') }}
          </p>
        </div>
        <UFormField :label="t('admin.dashboardKpis.window.label')">
          <UPopover :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar"
              trailing-icon="i-lucide-chevron-down"
              :aria-label="t('admin.dashboardKpis.window.label')"
            >
              {{ periodLabel }}
            </UButton>

            <template #content>
              <div class="p-3 space-y-3">
                <div class="flex items-center gap-1.5">
                  <UButton
                    v-for="p in presets"
                    :key="p.value"
                    size="xs"
                    :color="mode === 'preset' && windowDays === p.value ? 'primary' : 'neutral'"
                    :variant="mode === 'preset' && windowDays === p.value ? 'solid' : 'soft'"
                    @click="selectPreset(p.value)"
                  >
                    {{ p.label }}
                  </UButton>
                  <UButton
                    size="xs"
                    icon="i-lucide-calendar-range"
                    :color="mode === 'custom' ? 'primary' : 'neutral'"
                    :variant="mode === 'custom' ? 'solid' : 'soft'"
                    @click="selectCustom"
                  >
                    {{ t('admin.dashboardKpis.window.presetCustom') }}
                  </UButton>
                </div>

                <!-- Calendar appears only in Custom mode; range selection (start + end). -->
                <template v-if="mode === 'custom'">
                  <USeparator :label="t('admin.dashboardKpis.window.customRange')" />
                  <UCalendar
                    v-model="customRange"
                    range
                    :max-value="todayValue"
                    :min-value="minValue"
                  />
                  <p class="text-xs text-muted text-center">
                    <template v-if="rangeComplete">
                      {{ t('admin.dashboardKpis.window.customRangeHint', { days: customDays }) }}
                    </template>
                    <template v-else-if="customRange.start">
                      {{ t('admin.dashboardKpis.window.customPickEnd') }}
                    </template>
                    <template v-else>
                      {{ t('admin.dashboardKpis.window.customPickStart') }}
                    </template>
                  </p>
                </template>
              </div>
            </template>
          </UPopover>
        </UFormField>
      </header>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <!-- Loading skeleton — first load only -->
      <template v-else-if="initialLoading">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <USkeleton
            v-for="n in 5"
            :key="n"
            class="h-28"
          />
        </div>
        <USkeleton class="h-64" />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <USkeleton class="h-56" />
          <USkeleton class="h-56" />
        </div>
      </template>

      <!--
        Live figures. During a background refetch (range/preset change) the previous
        window's data stays mounted and is gently dimmed, so the eye sees a smooth
        fade rather than a skeleton flash on a quick load.
      -->
      <div
        v-else-if="kpis"
        class="space-y-6 transition-opacity duration-300 motion-reduce:transition-none"
        :class="refreshing ? 'opacity-50' : 'opacity-100'"
        :aria-busy="refreshing"
      >
        <!-- Proactive EU distance-selling nudge (self-hides below the warn band) -->
        <AdminDashboardEuTaxAlert :liability="kpis.eu_tax_liability" />

        <!-- KPI cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <AdminDashboardKpiCard
            :label="t('admin.dashboardKpis.cards.revenue')"
            :value="revenueEntries[0]?.formatted ?? '—'"
            :lines="revenueEntries.slice(1).map(e => e.formatted)"
            icon="i-lucide-banknote"
            accent="success"
          />
          <AdminDashboardKpiCard
            :label="t('admin.dashboardKpis.cards.aov')"
            :value="aovEntries[0]?.formatted ?? '—'"
            :lines="aovEntries.slice(1).map(e => e.formatted)"
            icon="i-lucide-trending-up"
            accent="primary"
          />
          <AdminDashboardKpiCard
            :label="t('admin.dashboardKpis.cards.orders')"
            :value="String(kpis.orders_total)"
            :hint="t('admin.dashboardKpis.cards.ordersInWindow', {
              count: kpis.orders_window,
              days: kpis.window_days,
            })"
            icon="i-lucide-shopping-cart"
          />
          <AdminDashboardKpiCard
            :label="t('admin.dashboardKpis.cards.pending')"
            :value="String(kpis.orders_pending)"
            :accent="kpis.orders_pending > 0 ? 'warning' : 'neutral'"
            icon="i-lucide-clock"
          />
          <AdminDashboardKpiCard
            :label="t('admin.dashboardKpis.cards.customers')"
            :value="String(kpis.customers_total)"
            :hint="t('admin.dashboardKpis.cards.newCustomers', {
              count: kpis.customers_window,
              days: kpis.window_days,
            })"
            icon="i-lucide-users"
          />
        </div>

        <!-- Threshold-aware low-stock summary, deep-linking into the inventory list -->
        <ClientOnly>
          <AdminDashboardLowStockBadge />
        </ClientOnly>

        <!-- Sales trend -->
        <AdminDashboardSalesTrend
          :points="kpis.sales_trend"
          :currencies="trendCurrencies"
          :default-currency="primaryCurrency"
          :window-days="kpis.window_days"
        />

        <!-- Top products + low stock -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminDashboardTopProducts :items="kpis.top_products" />
          <AdminDashboardLowStock
            :items="kpis.low_stock"
            :count="kpis.low_stock_count"
          />
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
