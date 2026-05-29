<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const windowDays = ref(30)
const windowOptions = computed(() => [
  { label: t('admin.dashboardKpis.window.last7'), value: 7 },
  { label: t('admin.dashboardKpis.window.last30'), value: 30 },
  { label: t('admin.dashboardKpis.window.last90'), value: 90 },
])

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
          <USelect
            v-model="windowDays"
            :items="windowOptions"
            value-key="value"
            class="w-40"
          />
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
