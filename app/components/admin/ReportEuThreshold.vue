<script setup lang="ts">
/**
 * EU distance-selling €10k threshold card for the reports page. Auto-imports as
 * `<AdminReportEuThreshold>`. Shows the current calendar year's cross-border B2C
 * net-of-VAT sales (EU destinations ≠ the home country) as a progress bar toward
 * the €10 000 One-Stop-Shop threshold, colour-coded by the backend's tiered
 * status. Below the line, the store charges home VAT (correct); at/above it,
 * destination VAT via OSS is owed — so the card exists to warn *before* the line.
 *
 * Modelled on Shopify's "Manage tax liability". All figures are already in EUR
 * (converted server-side); this component only formats and colours.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { EuDistanceSellingStatus, EuTaxStatus } from '~/composables/queries/useReportQueries'

const props = defineProps<{
  status: EuDistanceSellingStatus
}>()

const { t, locale } = useI18n()

/** Tiered status → Nuxt UI semantic colour (green / amber / red). */
const STATUS_COLOR: Record<EuTaxStatus, 'success' | 'warning' | 'error'> = {
  not_approaching: 'success',
  approaching: 'warning',
  threshold_met: 'error',
}
/** Same tiers → the Tailwind bg token for the progress fill. */
const STATUS_FILL: Record<EuTaxStatus, string> = {
  not_approaching: 'bg-success',
  approaching: 'bg-warning',
  threshold_met: 'bg-error',
}

const current = computed(() => props.status.current)
const prior = computed(() => props.status.prior)

const fmtEur = (amount: number): string => formatMoney(amount, 'EUR', locale.value)

const fmtPct = (pct: number): string =>
  new Intl.NumberFormat(locale.value, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(pct)

// Bar fill is capped at 100% even when the threshold is exceeded (pct > 1).
const fillWidth = computed(() => `${Math.min(current.value.pct, 1) * 100}%`)
const statusColor = computed(() => STATUS_COLOR[current.value.status])
const statusFill = computed(() => STATUS_FILL[current.value.status])

// The preceding year only matters when it carried sales (EU liability triggers on
// a crossing in the current OR the preceding year).
const showPrior = computed(() => prior.value.total_eur > 0)
const hasUnconvertible = computed(() => current.value.unconvertible_count > 0)
</script>

<template>
  <UCard data-testid="report-eu-threshold">
    <template #header>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold">
            {{ t('admin.reports.euThreshold.title') }}
          </h2>
          <p class="text-muted text-xs mt-0.5">
            {{ t('admin.reports.euThreshold.subtitle', { year: current.year }) }}
          </p>
        </div>
        <UBadge
          :color="statusColor"
          variant="subtle"
        >
          {{ t(`admin.reports.euThreshold.status.${current.status}`) }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <p class="text-2xl font-bold tabular-nums">
          {{ fmtEur(current.total_eur) }}
          <span class="text-muted text-base font-normal">
            {{ t('admin.reports.euThreshold.ofThreshold', {
              threshold: fmtEur(status.threshold_eur),
            }) }}
          </span>
        </p>
        <p class="text-sm text-muted tabular-nums">
          {{ fmtPct(current.pct) }}
        </p>
      </div>

      <!-- Progress toward the €10k line; fill colour follows the tiered status. -->
      <div
        class="h-2.5 w-full rounded-full bg-elevated overflow-hidden"
        role="progressbar"
        :aria-label="t('admin.reports.euThreshold.title')"
        :aria-valuenow="Math.round(current.pct * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full transition-[width] duration-500"
          :class="statusFill"
          :style="{ width: fillWidth }"
        />
      </div>

      <p
        v-if="current.status === 'threshold_met'"
        class="text-sm text-error"
      >
        {{ t('admin.reports.euThreshold.metNote') }}
      </p>
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ t('admin.reports.euThreshold.remaining', {
          amount: fmtEur(current.remaining_eur),
        }) }}
      </p>

      <div
        v-if="showPrior"
        class="text-sm text-muted border-t border-default pt-3 flex items-center justify-between gap-2"
      >
        <span>{{ t('admin.reports.euThreshold.priorYear', { year: prior.year }) }}</span>
        <span class="tabular-nums">
          {{ fmtEur(prior.total_eur) }}
          · {{ t(`admin.reports.euThreshold.status.${prior.status}`) }}
        </span>
      </div>

      <p
        v-if="hasUnconvertible"
        class="text-xs text-warning flex items-center gap-1.5"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="shrink-0"
        />
        {{ t('admin.reports.euThreshold.unconvertible', {
          count: current.unconvertible_count,
        }) }}
      </p>
    </div>
  </UCard>
</template>
