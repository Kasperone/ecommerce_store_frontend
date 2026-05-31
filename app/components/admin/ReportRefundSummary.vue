<script setup lang="ts">
/**
 * Refund-summary view for the reports page. Auto-imports as
 * `<AdminReportRefundSummary>`. Shows the total refund count plus one row per
 * currency: refunded amount, comparable revenue, and the refund rate
 * (`refunded / revenue`, computed per currency on the backend). Money is NEVER
 * summed across currencies — each currency is its own row.
 */
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { RefundSummaryRow } from '~/composables/queries/useReportQueries'

const props = defineProps<{
  refundCount: number
  rows: RefundSummaryRow[]
}>()

const { t, locale } = useI18n()

function fmtMoney(amount: number, currency: string): string {
  return formatMoney(amount, currency as CurrencyCode, locale.value)
}

function fmtRate(rate: number): string {
  return new Intl.NumberFormat(locale.value, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate)
}

const hasRows = computed(() => props.rows.length > 0)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="font-semibold">
          {{ t('admin.reports.refunds.title') }}
        </h2>
        <UBadge
          color="neutral"
          variant="subtle"
          class="tabular-nums"
        >
          {{ t('admin.reports.refunds.count', { count: refundCount }) }}
        </UBadge>
      </div>
    </template>

    <table
      v-if="hasRows"
      class="w-full text-sm"
    >
      <thead>
        <tr class="text-left text-xs uppercase tracking-wide text-muted">
          <th class="py-1 font-medium">
            {{ t('admin.reports.refunds.fields.currency') }}
          </th>
          <th class="py-1 font-medium text-right">
            {{ t('admin.reports.refunds.fields.refunded') }}
          </th>
          <th class="py-1 font-medium text-right">
            {{ t('admin.reports.refunds.fields.revenue') }}
          </th>
          <th class="py-1 font-medium text-right">
            {{ t('admin.reports.refunds.fields.rate') }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr
          v-for="row in rows"
          :key="row.currency"
        >
          <td class="py-2 font-medium">
            {{ row.currency }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ fmtMoney(row.refunded, row.currency) }}
          </td>
          <td class="py-2 text-right tabular-nums text-muted">
            {{ fmtMoney(row.revenue, row.currency) }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ fmtRate(row.rate) }}
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-else
      class="text-muted text-sm py-8 text-center"
    >
      {{ t('admin.reports.refunds.empty') }}
    </p>
  </UCard>
</template>
