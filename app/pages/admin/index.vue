<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
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

// The dashboard is a *trailing-window* view (period always ends today) — arbitrary
// historical from/to ranges belong to /admin/reports. So a "custom period" is just a
// custom *start* date: the admin picks how far back to look, the end stays pinned to
// today, and the span maps cleanly onto the backend's `window_days` (1–365) contract.
const MIN_DAYS = 1
const MAX_DAYS = 365 // mirrors the backend's `window_days` upper bound
const tz = getLocalTimeZone()
const todayValue = today(tz)
const minValue = todayValue.subtract({ days: MAX_DAYS - 1 })

const windowDays = ref(30)

const presets = computed(() => [
  { value: 7, label: t('admin.dashboardKpis.window.preset7') },
  { value: 30, label: t('admin.dashboardKpis.window.preset30') },
  { value: 90, label: t('admin.dashboardKpis.window.preset90') },
])

function fmtCalDate(d: CalendarDate): string {
  return d.toDate(tz).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Two-way bridge between the calendar's start date and `windowDays`. Reading derives
// the start from the window length; writing converts a picked start date back into an
// inclusive day count, clamped to the backend's accepted range.
const calendarValue = computed<CalendarDate>({
  get: () => todayValue.subtract({ days: windowDays.value - 1 }),
  set: (d) => {
    if (!d) return
    const start = dayjs(d.toDate(tz)).startOf('day')
    const days = dayjs().startOf('day').diff(start, 'day') + 1
    windowDays.value = Math.min(MAX_DAYS, Math.max(MIN_DAYS, days))
  },
})

const periodLabel = computed(() => {
  switch (windowDays.value) {
    case 7: return t('admin.dashboardKpis.window.last7')
    case 30: return t('admin.dashboardKpis.window.last30')
    case 90: return t('admin.dashboardKpis.window.last90')
    default: return t('admin.dashboardKpis.window.customLabel', {
      from: fmtCalDate(calendarValue.value),
    })
  }
})

const params = computed(() => ({ windowDays: windowDays.value }))
const { data: kpis, error } = useDashboardKpis(params)
const loading = computed(() => !kpis.value && !error.value)

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
                    :color="windowDays === p.value ? 'primary' : 'neutral'"
                    :variant="windowDays === p.value ? 'solid' : 'soft'"
                    @click="windowDays = p.value"
                  >
                    {{ p.label }}
                  </UButton>
                </div>
                <USeparator :label="t('admin.dashboardKpis.window.customStart')" />
                <UCalendar
                  v-model="calendarValue"
                  :max-value="todayValue"
                  :min-value="minValue"
                />
                <p class="text-xs text-muted text-center">
                  {{ t('admin.dashboardKpis.window.customHint', { days: windowDays }) }}
                </p>
              </div>
            </template>
          </UPopover>
        </UFormField>
      </header>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <!-- Loading skeleton -->
      <template v-else-if="loading">
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

      <template v-else-if="kpis">
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
      </template>
    </div>
  </NuxtLayout>
</template>
