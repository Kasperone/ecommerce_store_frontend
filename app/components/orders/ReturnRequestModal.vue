<script setup lang="ts">
/**
 * Customer "Request a return" modal.
 *
 * Line picker fed by the server-side eligibility response: each returnable
 * order line shows a qty stepper capped at its `returnable_qty` plus a
 * per-line reason select; an optional free-text comment (≤2000) rides along.
 * The parent owns the create mutation (mirrors `<AdminOrderRefundDialog>`):
 * this modal emits the `ReturnRequestCreate` payload and surfaces the parent's
 * raw caught error via the gold-standard `useValidatedForm` flow.
 *
 * Links the static returns-policy page (`/returns`) — the customer flow lives
 * here under the order detail, never on that route.
 *
 * Auto-imported as `<OrdersReturnRequestModal>` (pathPrefix prepends `orders/`).
 */
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import type {
  ReturnEligibilityResponse,
  ReturnItemCreate,
  ReturnReason,
  ReturnRequestCreate,
} from '#shared/types/api'
import { RETURN_REASONS } from '#shared/utils/returnStatus'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{
  eligibility: ReturnEligibilityResponse | null | undefined
  open: boolean
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [payload: ReturnRequestCreate]
}>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()

// This dialog is a custom <form> (not a <UForm>): the qty steppers are
// hard-capped by their max prop and the reason check happens in onSubmit, so
// we drive only the error message + toast — a null form ref makes
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

const reasonOptions = computed(() =>
  RETURN_REASONS.map(value => ({
    value,
    label: t(`orders.returns.reasonOptions.${value}`),
  })),
)

const lines = computed(() =>
  (props.eligibility?.lines ?? []).filter(line => line.returnable_qty > 0),
)

// ---------------------------------------------------------------------------
// Reactive form state — re-seeded on every `open` flip
// ---------------------------------------------------------------------------

/** Map of order_item_id → qty being returned in THIS request. */
const pickedQty = ref<Record<number, number>>({})
/** Map of order_item_id → selected reason (undefined until picked). */
const pickedReason = ref<Record<number, ReturnReason | undefined>>({})
const comment = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const freshQty: Record<number, number> = {}
    const freshReason: Record<number, ReturnReason | undefined> = {}
    for (const line of lines.value) {
      freshQty[line.order_item_id] = 0
      freshReason[line.order_item_id] = undefined
    }
    pickedQty.value = freshQty
    pickedReason.value = freshReason
    comment.value = ''
    errorMessage.value = ''
  },
  { immediate: true },
)

const anyItemsPicked = computed(() =>
  Object.values(pickedQty.value).some(q => q > 0),
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function onSubmit() {
  const items: ReturnItemCreate[] = []
  let missingReason = false
  for (const line of lines.value) {
    const qty = pickedQty.value[line.order_item_id] || 0
    if (qty <= 0) continue
    const reason = pickedReason.value[line.order_item_id]
    if (!reason) {
      missingReason = true
      continue
    }
    items.push({ order_item_id: line.order_item_id, quantity: qty, reason })
  }
  if (missingReason) {
    errorMessage.value = t('orders.returns.modal.errors.reasonRequired')
    return
  }
  if (items.length === 0) {
    errorMessage.value = t('orders.returns.modal.errors.noItems')
    return
  }
  emit('submit', {
    items,
    comment: comment.value.trim() || null,
  })
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('orders.returns.modal.title')"
    :description="t('orders.returns.modal.description')"
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
        <section data-testid="return-line-picker">
          <h3 class="mb-2 text-sm font-semibold">
            {{ t('orders.returns.modal.linePicker.title') }}
          </h3>
          <p class="mb-2 text-xs text-muted">
            {{ t('orders.returns.modal.linePicker.hint') }}
          </p>
          <div class="space-y-2">
            <div
              v-for="line in lines"
              :key="line.order_item_id"
              class="space-y-2 rounded-md border border-default bg-elevated px-3 py-2 text-sm"
              :data-testid="`return-line-${line.order_item_id}`"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-medium">
                    {{ line.product_name }}
                  </div>
                  <div
                    v-if="line.variant_title"
                    class="text-xs text-muted"
                  >
                    {{ line.variant_title }}
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span
                    class="text-xs text-muted"
                    :data-testid="`return-line-${line.order_item_id}-available`"
                  >
                    {{ t('orders.returns.modal.linePicker.availableColumn', {
                      remaining: line.returnable_qty, total: line.quantity,
                    }) }}
                  </span>
                  <UInputNumber
                    v-model="pickedQty[line.order_item_id]"
                    :min="0"
                    :max="line.returnable_qty"
                    :step="1"
                    class="w-28"
                    :data-testid="`return-line-${line.order_item_id}-qty`"
                    :aria-label="t('orders.returns.modal.linePicker.qtyAriaLabel', {
                      product: line.product_name,
                    })"
                  />
                </div>
              </div>
              <USelect
                v-if="(pickedQty[line.order_item_id] || 0) > 0"
                v-model="pickedReason[line.order_item_id]"
                :items="reasonOptions"
                value-key="value"
                :placeholder="t('orders.returns.modal.reasonPlaceholder')"
                class="w-full"
                :data-testid="`return-line-${line.order_item_id}-reason`"
                :aria-label="t('orders.returns.modal.reasonAriaLabel', {
                  product: line.product_name,
                })"
              />
            </div>
          </div>
        </section>

        <UFormField :label="t('orders.returns.modal.comment')">
          <UTextarea
            v-model="comment"
            :rows="3"
            :placeholder="t('orders.returns.modal.commentPlaceholder')"
            :maxlength="2000"
            class="w-full"
            data-testid="return-comment"
          />
        </UFormField>

        <p class="text-xs text-muted">
          <NuxtLink
            :to="localePath('/returns')"
            target="_blank"
            class="text-primary underline underline-offset-2"
            data-testid="return-policy-link"
          >
            {{ t('orders.returns.modal.policyLink') }}
          </NuxtLink>
        </p>
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
          {{ t('orders.returns.modal.cancel') }}
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-undo-2"
          :loading="loading"
          :disabled="!anyItemsPicked"
          data-testid="return-submit"
          @click="onSubmit"
        >
          {{ t('orders.returns.modal.submit') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
