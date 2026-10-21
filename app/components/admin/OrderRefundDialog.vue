<script setup lang="ts">
/**
 * Admin "Issue refund" dialog.
 *
 * v2 ships the per-line refund picker + arbitrary amounts:
 *
 * - Each order line shows "Qty available" (= `order_item.quantity` minus what
 *   prior refunds already took for that line) and a `UInputNumber` for the qty
 *   being refunded in THIS request. The displayed amount auto-fills from
 *   `sum(picked × unit_price)`; the admin can override it to record a goodwill
 *   credit on top of the returned items.
 * - The running-total hint underneath the amount shows what has already been
 *   refunded vs the order total + how much remains.
 * - Restock defaults per D2 (on for pre-shipping statuses) and is disabled
 *   when no items are picked (D5 backend guard, surfaced as UX).
 * - The amount is capped at the remaining refundable balance via a max-prop;
 *   over-refund + line-over-qty still 400 server-side as a defense-in-depth.
 *
 * Auto-imported as `<AdminOrderRefundDialog>` (pathPrefix prepends `admin/`).
 */
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import type {
  OrderItemResponse,
  OrderStatus,
  OrderWithUser,
  RefundCreate,
  RefundItemCreate,
  RefundReason,
  RefundResponse,
} from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'

const props = defineProps<{
  order: OrderWithUser
  open: boolean
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [payload: RefundCreate]
}>()

const { t, locale } = useI18n()
const toast = useToast()

// This dialog is a custom <form> (not a <UForm>) with no client-validatable
// fields, so we drive only the error message + toast: a null form ref makes
// applyApiError skip field-mapping/scroll and just surface the message.
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage, applyApiError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('messages.saveError'))
    else errorMessage.value = ''
  },
)

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

// ---------------------------------------------------------------------------
// Running totals (computed from `order.refunds`)
// ---------------------------------------------------------------------------

/**
 * Total amount already refunded across all prior refunds on this order.
 * Read from the eager-loaded `order.refunds[]`; the backend re-validates
 * against a fresh DB query so a stale value here is only a UX hint.
 */
const priorTotal = computed(() => {
  const refunds = (props.order.refunds || []) as RefundResponse[]
  return refunds.reduce((acc, r) => acc + (r.amount || 0), 0)
})

const remainingTotal = computed(() => {
  const remaining = props.order.total - priorTotal.value
  return remaining > 0 ? remaining : 0
})

/** Cumulative qty already refunded per `order_item_id` across all prior refunds. */
const priorQtyByLine = computed(() => {
  const refunds = (props.order.refunds || []) as RefundResponse[]
  const acc: Record<number, number> = {}
  for (const r of refunds) {
    for (const ri of r.items || []) {
      acc[ri.order_item_id] = (acc[ri.order_item_id] || 0) + ri.quantity
    }
  }
  return acc
})

const lineRows = computed(() => {
  const items = (props.order.items || []) as OrderItemResponse[]
  return items.map((item) => {
    const refunded = priorQtyByLine.value[item.id] || 0
    const remainingQty = item.quantity - refunded
    return {
      id: item.id,
      productName: item.product_name,
      unitPrice: item.unit_price,
      lineQty: item.quantity,
      remainingQty: remainingQty > 0 ? remainingQty : 0,
    }
  })
})

// ---------------------------------------------------------------------------
// Reactive form state — re-seeded on every `open` flip
// ---------------------------------------------------------------------------

const reason = ref<RefundReason>('customer_request')
const note = ref('')
const restock = ref(true)
/** Map of order_item.id → qty being refunded in THIS request. */
const pickedQty = ref<Record<number, number>>({})
/** Amount the admin sees / submits. Auto-fills from picker but can be overridden. */
const amount = ref<number>(0)
/**
 * Whether the amount field has been touched manually since the picker changed.
 * When true, the picker `watch` no longer overwrites the amount on every tick
 * (so a goodwill bump-up doesn't get clobbered when the admin tweaks a qty).
 */
const amountOverridden = ref(false)

function defaultRestock(status: OrderStatus): boolean {
  return status === 'paid' || status === 'processing'
}

function resetPicker() {
  const fresh: Record<number, number> = {}
  for (const line of lineRows.value) {
    fresh[line.id] = 0
  }
  pickedQty.value = fresh
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    reason.value = 'customer_request'
    note.value = ''
    restock.value = defaultRestock(props.order.status)
    resetPicker()
    amount.value = 0
    amountOverridden.value = false
  },
  { immediate: true },
)

// ---------------------------------------------------------------------------
// Picker → amount auto-fill
// ---------------------------------------------------------------------------

const pickedSubtotal = computed(() =>
  lineRows.value.reduce(
    (acc, line) => acc + (pickedQty.value[line.id] || 0) * line.unitPrice,
    0,
  ),
)

const anyItemsPicked = computed(() =>
  Object.values(pickedQty.value).some(q => q > 0),
)

watch(pickedSubtotal, (sub) => {
  if (amountOverridden.value) return
  amount.value = Math.round(sub * 100) / 100
})

function onAmountInput() {
  // Mark the amount as overridden the moment the admin touches it directly so
  // a later picker change doesn't clobber the goodwill bump-up.
  amountOverridden.value = true
}

// ---------------------------------------------------------------------------
// Derived UI bits
// ---------------------------------------------------------------------------

function money(n: number): string {
  return formatMoney(n, props.order.currency as CurrencyCode, locale.value)
}

const runningTotalCopy = computed(() =>
  t('admin.orders.refund.runningTotal', {
    refunded: money(priorTotal.value),
    total: money(props.order.total),
    remaining: money(remainingTotal.value),
  }),
)

const restockDisabled = computed(() => !anyItemsPicked.value)
// When the picker is empty, restock can't be honored backend-side anyway
// (D5 returns 400). Force-off so the submit payload matches what we render.
// `immediate: true` so the very first mount under e.g. status=paid (D2 default
// restock=true) sees the empty-picker truth and flips restock to false before
// any submit fires.
watch(restockDisabled, (disabled) => {
  if (disabled) restock.value = false
}, { immediate: true })

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function buildItemsPayload(): RefundItemCreate[] | null {
  const items: RefundItemCreate[] = []
  for (const line of lineRows.value) {
    const qty = pickedQty.value[line.id] || 0
    if (qty > 0) {
      items.push({ order_item_id: line.id, quantity: qty })
    }
  }
  // Send `null` (not `[]`) for goodwill refunds — keeps the backend's
  // `items=None` branch and `items=[]` branch identical in shape (the BE
  // treats both as "no picker").
  return items.length > 0 ? items : null
}

function onSubmit() {
  const items = buildItemsPayload()
  // Force `restock=false` when nothing was picked. The on-screen checkbox is
  // already disabled in that case (and the `restockDisabled` watcher zeroes
  // the ref on mount), but the `open` re-seed bumps `restock` back to the D2
  // default and the `restockDisabled` watcher won't re-fire if the empty-
  // picker truth didn't change — leaving a stale `restock=true` in the
  // payload that the backend rightly 400s (D5). Belt + suspenders.
  emit('submit', {
    amount: amount.value,
    reason: reason.value,
    note: note.value.trim() || null,
    restock: restock.value && items !== null,
    items,
    // Wire-identical to the backend default; the generated type marks it required.
    destination: 'original',
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
      <UAlert
        v-if="errorMessage"
        role="alert"
        color="error"
        variant="soft"
        class="mb-4"
        :title="t('messages.saveErrorTitle')"
        :description="errorMessage"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="errorMessage = ''"
      />

      <form
        class="space-y-5"
        @submit.prevent="onSubmit"
      >
        <!-- Per-line picker -->
        <section data-testid="refund-line-picker">
          <h3 class="mb-2 text-sm font-semibold">
            {{ t('admin.orders.refund.linePicker.title') }}
          </h3>
          <p class="mb-2 text-xs text-muted">
            {{ t('admin.orders.refund.linePicker.qtyAvailHint') }}
          </p>
          <div class="space-y-2">
            <div
              v-for="line in lineRows"
              :key="line.id"
              class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md border border-default bg-elevated px-3 py-2 text-sm"
              :data-testid="`refund-line-${line.id}`"
            >
              <div class="font-medium">
                {{ line.productName }}
              </div>
              <div
                class="text-xs text-muted"
                :data-testid="`refund-line-${line.id}-available`"
              >
                {{ t('admin.orders.refund.linePicker.availableColumn', {
                  remaining: line.remainingQty, total: line.lineQty,
                }) }}
              </div>
              <UInputNumber
                v-model="pickedQty[line.id]"
                :min="0"
                :max="line.remainingQty"
                :step="1"
                class="w-28"
                :data-testid="`refund-line-${line.id}-qty`"
                :aria-label="t('admin.orders.refund.linePicker.qtyAriaLabel', {
                  product: line.productName,
                })"
              />
              <div
                class="text-right font-mono text-xs text-muted"
                :data-testid="`refund-line-${line.id}-subtotal`"
              >
                {{ money((pickedQty[line.id] || 0) * line.unitPrice) }}
              </div>
            </div>
          </div>
        </section>

        <!-- Amount (editable; auto-fills from picker, override for goodwill) -->
        <UFormField :label="t('admin.orders.refund.amount')">
          <UInputNumber
            v-model="amount"
            :min="0.01"
            :max="remainingTotal || undefined"
            :step="0.01"
            class="w-full"
            data-testid="refund-amount"
            @update:model-value="onAmountInput"
          />
          <p class="mt-1 text-xs text-muted">
            {{ t('admin.orders.refund.amountHint') }}
          </p>
          <p
            class="mt-1 text-xs text-muted"
            data-testid="refund-running-total"
          >
            {{ runningTotalCopy }}
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
          :disabled="restockDisabled"
          :label="t('admin.orders.refund.restock')"
          :description="restockDisabled
            ? t('admin.orders.refund.restockNeedsItems')
            : t('admin.orders.refund.restockHint')"
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
          @click="() => { openModel = false }"
        >
          {{ t('admin.orders.refund.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-undo-2"
          :loading="loading"
          :disabled="amount <= 0"
          @click="onSubmit"
        >
          {{ t('admin.orders.refund.submit') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
