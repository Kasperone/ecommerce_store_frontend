<script setup lang="ts">
/**
 * Customer "Refunds" section on the account order detail page.
 *
 * Privacy-gated mirror of `<AdminOrderRefundsSection>`: shows amount + reason
 * (translated to a customer-friendly phrase) + date + the v2 per-item
 * breakdown (just product_name + quantity — NEVER unit_price or
 * line_subtotal, which are admin-only). NEVER shows the admin's internal
 * note nor the actor email. The full legal trail rides on the faktura
 * korygująca PDF that arrived by email (the customer can re-download the
 * order's invoice from the page header).
 *
 * Auto-imported as `<OrdersRefundsSection>` (pathPrefix prepends `orders/`).
 */
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { OrderStatus, RefundResponse } from '#shared/types/api'

const props = defineProps<{
  refunds: RefundResponse[]
  currency: string
  /** Parent order status — drives the partial-vs-full banner copy. */
  status?: OrderStatus
  /** Parent order total — drives the "X of Y refunded" summary line. */
  orderTotal?: number
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

const isPartial = computed(() => props.status === 'partially_refunded')

const totalRefunded = computed(() =>
  props.refunds.reduce((acc, r) => acc + (r.amount || 0), 0),
)

const summaryLine = computed(() => {
  if (!isPartial.value || props.orderTotal == null) return null
  return t('orders.refund.totalRefunded', {
    refunded: money(totalRefunded.value, props.currency),
    total: money(props.orderTotal, props.currency),
  })
})

const sectionTitle = computed(() =>
  isPartial.value ? t('orders.refund.partialTitle') : t('orders.refund.title'),
)
</script>

<template>
  <section
    v-if="refunds.length > 0"
    class="rounded-lg border border-warning/30 bg-warning/5 p-4 dark:bg-warning/10"
    data-testid="customer-refunds"
  >
    <h2 class="mb-2 font-semibold">
      {{ sectionTitle }}
    </h2>
    <p class="mb-2 text-sm text-muted">
      {{ t('orders.refund.intro') }}
    </p>
    <p
      v-if="summaryLine"
      class="mb-3 text-sm font-medium text-warning"
      data-testid="customer-refund-summary"
    >
      {{ summaryLine }}
    </p>

    <ul class="divide-y divide-warning/20">
      <li
        v-for="refund in refunds"
        :key="refund.id"
        class="space-y-1.5 py-2 text-sm first:pt-0 last:pb-0"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
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
        </div>
        <!-- Per-item breakdown (v2). Privacy-safe: product_name + quantity only —
             unit_price and line_subtotal are NEVER rendered to the customer
             here. Omitted entirely for goodwill refunds (items=[]). -->
        <ul
          v-if="refund.items && refund.items.length > 0"
          class="ml-2 space-y-0.5 text-xs text-muted"
          :data-testid="`customer-refund-${refund.id}-items`"
        >
          <li
            v-for="ri in refund.items"
            :key="ri.id"
          >
            •
            {{ t('orders.refund.items.line', {
              name: ri.product_name ?? '—', qty: ri.quantity,
            }) }}
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
