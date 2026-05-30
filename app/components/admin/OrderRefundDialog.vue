<script setup lang="ts">
/**
 * Admin "Issue refund" dialog.
 *
 * v1 ships **full refunds only** — the amount is rendered read-only as
 * `order.total` and submitted verbatim. Partial-refund UI is a v2 PR
 * (the backend schema already accepts any amount; route 400s for now).
 *
 * Restock defaults per D2: on for `paid`/`processing` (goods haven't shipped),
 * off for `shipped`/`delivered` (we don't physically have them back).
 *
 * Auto-imported as `<AdminOrderRefundDialog>` (pathPrefix prepends `admin/`
 * to the file name); the bare `<OrderRefundDialog>` name fails silently with
 * a Vue warn — see `pathprefix_bare_component_gotcha`.
 */
import { useI18n } from 'vue-i18n'
import type { OrderStatus, OrderWithUser, RefundCreate, RefundReason } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'

const props = defineProps<{
  order: OrderWithUser
  open: boolean
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [payload: RefundCreate]
}>()

const { t, locale } = useI18n()

// D4: enum + free text. Build the select options + dropdown labels off the
// REFUND_REASONS literal so adding a value is one i18n key + this array.
const REFUND_REASONS: RefundReason[] = [
  'defective',
  'wrong_item',
  'customer_request',
  'lost_in_transit',
  'damaged_in_transit',
  'other',
]

const reasonOptions = computed(() =>
  REFUND_REASONS.map(value => ({
    value,
    label: t(`admin.orders.refund.reasonOptions.${value}`),
  })),
)

// Defaults — re-seeded whenever the dialog re-opens so a previous open's
// inputs don't bleed in (the parent toggles `open` between issues).
const reason = ref<RefundReason>('customer_request')
const note = ref('')
const restock = ref(true)

// D2: prefer restock when goods haven't physically shipped yet.
function defaultRestock(status: OrderStatus): boolean {
  return status === 'paid' || status === 'processing'
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    reason.value = 'customer_request'
    note.value = ''
    restock.value = defaultRestock(props.order.status)
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const amountLabel = computed(() => {
  // Same formatter the rest of the admin order detail uses — Intl.NumberFormat
  // scoped to the order's own currency (multi-currency: orders never mix).
  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: props.order.currency,
  }).format(props.order.total)
})

function onSubmit() {
  emit('submit', {
    amount: props.order.total,
    reason: reason.value,
    note: note.value.trim() || null,
    restock: restock.value,
  })
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('admin.orders.refund.title')"
    :description="t('admin.orders.refund.description')"
    :dismissible="!loading"
  >
    <template #body>
      <ErrorAlert
        v-if="error"
        :problem="error"
        class="mb-4"
      />

      <form
        class="space-y-4"
        @submit.prevent="onSubmit"
      >
        <!-- Amount (read-only in v1) -->
        <UFormField :label="t('admin.orders.refund.amountReadOnly')">
          <div
            class="rounded-md border border-default bg-elevated px-3 py-2 font-mono text-sm"
            data-testid="refund-amount-readonly"
          >
            {{ amountLabel }}
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ t('admin.orders.refund.amountHint') }}
          </p>
        </UFormField>

        <UFormField
          :label="t('admin.orders.refund.reason')"
          required
        >
          <USelect
            v-model="reason"
            :items="reasonOptions"
            value-key="value"
            class="w-full"
            data-testid="refund-reason"
          />
        </UFormField>

        <UFormField :label="t('admin.orders.refund.note')">
          <UTextarea
            v-model="note"
            :rows="3"
            :placeholder="t('admin.orders.refund.notePlaceholder')"
            :maxlength="500"
            class="w-full"
            data-testid="refund-note"
          />
          <p class="mt-1 text-xs text-muted">
            {{ t('admin.orders.refund.noteHint') }}
          </p>
        </UFormField>

        <UCheckbox
          v-model="restock"
          :label="t('admin.orders.refund.restock')"
          :description="t('admin.orders.refund.restockHint')"
          data-testid="refund-restock"
        />
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="openModel = false"
        >
          {{ t('admin.orders.refund.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-undo-2"
          :loading="loading"
          @click="onSubmit"
        >
          {{ t('admin.orders.refund.submit') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
