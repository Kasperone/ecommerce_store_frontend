<script setup lang="ts">
/**
 * Admin "Refunds" section on the order detail page.
 *
 * Read-only list. Each row carries the amount + currency + reason badge +
 * actor email + date + the admin's internal note + a restock badge + (when
 * present) the issued KOR number. The customer-facing equivalent
 * (`<OrdersRefundsSection>`) intentionally drops the note + KOR ref —
 * privacy and to keep the legal copy in one place (the attached PDF).
 *
 * Auto-imported as `<AdminOrderRefundsSection>` (pathPrefix).
 */
import { useI18n } from 'vue-i18n'
import type { RefundResponse } from '#shared/types/api'

defineProps<{
  refunds: RefundResponse[]
  currency: string
}>()

const { t, locale } = useI18n()

const dateFmt = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
)

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(amount)
}

function reasonLabel(reason: string): string {
  return t(`admin.orders.refund.reasonOptions.${reason}`, { default: reason })
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ t('admin.orders.refundsSection.title') }}
      </h2>
    </template>

    <p
      v-if="refunds.length === 0"
      class="text-sm text-muted"
    >
      {{ t('admin.orders.refundsSection.empty') }}
    </p>

    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="refund in refunds"
        :key="refund.id"
        class="space-y-2 py-3 text-sm first:pt-0 last:pb-0"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="space-y-0.5">
            <div class="font-mono font-semibold">
              {{ money(refund.amount, refund.currency || currency) }}
            </div>
            <div class="text-xs text-muted">
              {{ dateFmt.format(new Date(refund.created_at)) }}
              <span class="mx-1">·</span>
              {{ refund.actor_email ?? t('admin.orders.refund.actorRemoved') }}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              color="warning"
              variant="subtle"
              size="sm"
            >
              {{ reasonLabel(refund.reason) }}
            </UBadge>
            <UBadge
              v-if="refund.restock"
              color="info"
              variant="subtle"
              size="sm"
            >
              {{ t('admin.orders.refundsSection.restockBadge') }}
            </UBadge>
          </div>
        </div>

        <p
          v-if="refund.note"
          class="text-xs text-muted italic"
          data-testid="refund-note-admin"
        >
          {{ refund.note }}
        </p>

        <p
          v-if="refund.corrective_invoice"
          class="text-xs text-muted"
        >
          <UIcon
            name="i-lucide-receipt"
            class="size-3"
          />
          <span class="ml-1">{{
            t('admin.orders.refundsSection.kor', {
              number: refund.corrective_invoice.kor_number,
            })
          }}</span>
        </p>
      </li>
    </ul>
  </UCard>
</template>
