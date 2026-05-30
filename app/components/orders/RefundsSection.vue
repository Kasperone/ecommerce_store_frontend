<script setup lang="ts">
/**
 * Customer "Refunds" section on the account order detail page.
 *
 * Privacy-gated mirror of `<AdminOrderRefundsSection>`: shows amount + reason
 * (translated to a customer-friendly phrase) + date, but NEVER the admin's
 * internal note or the actor email. The full legal trail rides on the faktura
 * korygująca PDF that arrived by email (the customer can re-download the
 * order's invoice from the page header).
 *
 * Auto-imported as `<OrdersRefundsSection>` (pathPrefix prepends `orders/`).
 */
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { RefundResponse } from '#shared/types/api'

defineProps<{
  refunds: RefundResponse[]
  currency: string
}>()

const { t, locale } = useI18n()

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))

function money(amount: number, ccy: string): string {
  return formatMoney(amount, ccy as CurrencyCode, locale.value)
}

function reasonLabel(reason: string): string {
  // Customer-friendly phrasing — e.g. "Per your request" rather than the
  // admin's enum value "customer_request". Keys live under `orders.refund.*`.
  return t(`orders.refund.reasonOptions.${reason}`, { default: reason })
}
</script>

<template>
  <section
    v-if="refunds.length > 0"
    class="rounded-lg border border-warning/30 bg-warning/5 p-4 dark:bg-warning/10"
    data-testid="customer-refunds"
  >
    <h2 class="mb-2 font-semibold">
      {{ t('orders.refund.title') }}
    </h2>
    <p class="mb-3 text-sm text-muted">
      {{ t('orders.refund.intro') }}
    </p>

    <ul class="divide-y divide-warning/20">
      <li
        v-for="refund in refunds"
        :key="refund.id"
        class="flex flex-wrap items-start justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
      >
        <div>
          <div class="font-mono font-semibold">
            {{ money(refund.amount, refund.currency || currency) }}
          </div>
          <div class="text-xs text-muted">
            {{ dateFmt.format(new Date(refund.created_at)) }}
          </div>
        </div>
        <UBadge
          color="warning"
          variant="subtle"
          size="sm"
        >
          {{ reasonLabel(refund.reason) }}
        </UBadge>
      </li>
    </ul>
  </section>
</template>
