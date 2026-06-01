<script setup lang="ts">
/**
 * Discount-code field on `/checkout`. The customer types a code and hits Apply;
 * we preview the discount via `POST /api/v1/coupons/validate` and emit the
 * applied `{ code, discountAmount }` (or `null`) up to the page, which threads
 * `code` onto the create-order payload and shows the discount in the summary.
 *
 * The preview is advisory — the backend re-validates and re-computes at order
 * create. We re-validate here whenever subtotal/currency change while a coupon
 * is applied (e.g. a currency switch may invalidate a fixed-currency coupon or
 * move a percentage amount), clearing the coupon with a notice on failure so the
 * displayed total never diverges from what checkout will charge.
 */

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

export interface AppliedCoupon {
  code: string
  discountAmount: number
}

const props = defineProps<{
  /** Cart subtotal in `currency` — the discount is computed against this. */
  subtotal: number
  /** USD / PLN / EUR — the cart's selected currency. */
  currency: CurrencyCode
  /** Currently-applied coupon (lifted state). `null` when none. */
  modelValue: AppliedCoupon | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AppliedCoupon | null]
}>()

const { t, locale } = useI18n()
const validateCoupon = useValidateCoupon()

const code = ref('')
const error = ref<string | null>(null)

async function apply() {
  const trimmed = code.value.trim()
  if (!trimmed) return
  error.value = null
  try {
    const result = await validateCoupon.mutateAsync({
      code: trimmed,
      subtotal: props.subtotal,
      currency: props.currency,
    })
    emit('update:modelValue', { code: result.code, discountAmount: result.discount_amount })
    code.value = ''
  }
  catch (err) {
    emit('update:modelValue', null)
    error.value = parseProblem(err)?.detail ?? t('checkout.coupon.invalid')
  }
}

function remove() {
  emit('update:modelValue', null)
  error.value = null
}

// Re-validate a still-applied coupon when the subtotal or currency changes, so a
// currency switch / cart change can't leave a stale (or now-ineligible) discount
// on screen. Silent on success; clears the coupon with the backend reason on
// failure. Skipped when nothing is applied.
watch(
  () => [props.subtotal, props.currency] as const,
  async () => {
    const applied = props.modelValue
    if (!applied) return
    try {
      const result = await validateCoupon.mutateAsync({
        code: applied.code,
        subtotal: props.subtotal,
        currency: props.currency,
      })
      emit('update:modelValue', { code: result.code, discountAmount: result.discount_amount })
    }
    catch (err) {
      emit('update:modelValue', null)
      error.value = parseProblem(err)?.detail ?? t('checkout.coupon.invalid')
    }
  },
)
</script>

<template>
  <div data-testid="coupon-field">
    <!-- Applied state: show the code + discount with a remove button -->
    <div
      v-if="modelValue"
      class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-3"
      data-testid="coupon-applied"
    >
      <span class="flex items-center gap-2 text-sm">
        <UIcon
          name="i-lucide-ticket"
          class="text-primary"
        />
        <span class="font-medium">{{ modelValue.code }}</span>
        <span class="text-muted">
          −{{ formatMoney(modelValue.discountAmount, currency, locale) }}
        </span>
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-x"
        :aria-label="t('checkout.coupon.remove')"
        data-testid="coupon-remove"
        @click="remove"
      />
    </div>

    <!-- Entry state: input + apply -->
    <form
      v-else
      class="flex items-start gap-2"
      data-testid="coupon-entry"
      @submit.prevent="apply"
    >
      <div class="flex-1">
        <UInput
          v-model="code"
          :placeholder="t('checkout.coupon.placeholder')"
          :aria-label="t('checkout.coupon.label')"
          autocapitalize="characters"
          class="w-full"
          data-testid="coupon-input"
        />
        <p
          v-if="error"
          class="mt-1 text-xs text-error"
          data-testid="coupon-error"
        >
          {{ error }}
        </p>
      </div>
      <UButton
        type="submit"
        color="neutral"
        variant="subtle"
        :loading="validateCoupon.isLoading.value"
        :disabled="!code.trim()"
        data-testid="coupon-apply"
      >
        {{ t('checkout.coupon.apply') }}
      </UButton>
    </form>
  </div>
</template>
