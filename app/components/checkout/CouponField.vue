<script setup lang="ts">
/**
 * Discount-code field on `/checkout`. The customer types a code and hits Apply;
 * we preview the discount via `POST /api/v1/coupons/validate` and emit the
 * applied `{ code, discountAmount, freeShipping, isAutomatic }` (or `null`) up
 * to the page, which threads `code` onto the create-order payload (manual codes
 * only — automatics are re-picked server-side) and shows the discount in the
 * summary.
 *
 * Automatic discounts: the endpoint also accepts a code-less request and
 * returns the best matching automatic coupon (same `pick_best` as checkout),
 * so we fire a debounced no-code validate on subtotal/shipping/currency change
 * (and on mount) to preview automatics without the customer typing anything.
 * An automatic renders as a non-dismissible line; a manual code keeps the
 * dismissible chip. A typed code that loses to a bigger automatic comes back
 * as that automatic (200) — the customer sees the better deal applied.
 *
 * The preview is advisory — the backend re-validates and re-computes at order
 * create. We re-validate a manually-applied coupon whenever subtotal/shipping/
 * currency change (e.g. a currency switch may invalidate a fixed-currency
 * coupon), clearing it with a notice on failure so the displayed total never
 * diverges from what checkout will charge.
 */

import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { CouponValidateResponse } from '~/composables/queries/useCouponValidate'

export interface AppliedCoupon {
  code: string
  /** Goods discount for percent/fixed; shipping saved for free_shipping. */
  discountAmount: number
  /** True ⇒ the summary shows shipping struck through to 0 (no goods-discount line). */
  freeShipping: boolean
  /** True ⇒ applied without a typed code; non-dismissible, not sent on the payload. */
  isAutomatic: boolean
}

const props = defineProps<{
  /** Cart subtotal in `currency` — the discount is computed against this. */
  subtotal: number
  /**
   * The shipping the cart would otherwise pay (post free-above-threshold) —
   * what a free_shipping coupon saves. Pass the already-resolved amount.
   */
  shippingAmount: number
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

/** Map a validate response to the lifted state (`null` on the nothing-applies 200). */
function toApplied(result: CouponValidateResponse | undefined): AppliedCoupon | null {
  if (!result?.code) return null
  return {
    code: result.code,
    discountAmount: result.discount_amount ?? 0,
    freeShipping: result.free_shipping,
    isAutomatic: result.is_automatic,
  }
}

function sameApplied(a: AppliedCoupon | null, b: AppliedCoupon | null): boolean {
  if (a === null || b === null) return a === b
  return a.code === b.code
    && a.discountAmount === b.discountAmount
    && a.freeShipping === b.freeShipping
    && a.isAutomatic === b.isAutomatic
}

// --- Automatic-discount preview (debounced, code-less validate) -------------

const AUTO_PREVIEW_DEBOUNCE_MS = 300
let previewTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Code-less validate: previews the best matching automatic discount (or clears
 * a stale one). Background call — failures are swallowed (the order create
 * re-picks authoritatively) and a manually-applied code is never clobbered.
 */
async function previewAutomatic() {
  if (props.modelValue && !props.modelValue.isAutomatic) return
  try {
    const result = await validateCoupon.mutateAsync({
      code: null,
      subtotal: props.subtotal,
      shipping_amount: props.shippingAmount,
      currency: props.currency,
    })
    const applied = toApplied(result)
    if (!sameApplied(applied, props.modelValue)) emit('update:modelValue', applied)
  }
  catch {
    // Silent: a failed background preview must not surface an error. Clear a
    // stale automatic so the summary never shows a discount we can't confirm.
    if (props.modelValue?.isAutomatic) emit('update:modelValue', null)
  }
}

function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => void previewAutomatic(), AUTO_PREVIEW_DEBOUNCE_MS)
}

onBeforeUnmount(() => clearTimeout(previewTimer))

// --- Manual code entry -------------------------------------------------------

async function apply() {
  const trimmed = code.value.trim()
  if (!trimmed) return
  error.value = null
  try {
    const result = await validateCoupon.mutateAsync({
      code: trimmed,
      subtotal: props.subtotal,
      shipping_amount: props.shippingAmount,
      currency: props.currency,
    })
    emit('update:modelValue', toApplied(result))
    code.value = ''
  }
  catch (err) {
    // An invalid typed code never silently falls back to an automatic (the
    // backend 400s) — but keep an already-previewed automatic on screen.
    if (!props.modelValue?.isAutomatic) emit('update:modelValue', null)
    error.value = parseProblem(err)?.detail ?? t('checkout.coupon.invalid')
  }
}

function remove() {
  emit('update:modelValue', null)
  error.value = null
  // A removed manual code may uncover an applicable automatic — re-preview.
  schedulePreview()
}

// Re-validate on subtotal/shipping/currency change so a currency switch / cart
// change can't leave a stale (or now-ineligible) discount on screen. A manual
// coupon re-validates immediately with its code (clearing with the backend
// reason on failure); otherwise the debounced no-code preview runs so
// automatics appear/refresh without typing. `immediate` previews on mount.
watch(
  () => [props.subtotal, props.shippingAmount, props.currency] as const,
  async () => {
    const applied = props.modelValue
    if (!applied || applied.isAutomatic) {
      schedulePreview()
      return
    }
    try {
      const result = await validateCoupon.mutateAsync({
        code: applied.code,
        subtotal: props.subtotal,
        shipping_amount: props.shippingAmount,
        currency: props.currency,
      })
      emit('update:modelValue', toApplied(result))
    }
    catch (err) {
      emit('update:modelValue', null)
      error.value = parseProblem(err)?.detail ?? t('checkout.coupon.invalid')
      schedulePreview()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div data-testid="coupon-field">
    <!-- Automatic discount: non-dismissible info line (no remove button). -->
    <div
      v-if="modelValue?.isAutomatic"
      class="mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
      data-testid="coupon-automatic"
    >
      <UIcon
        name="i-lucide-badge-percent"
        class="text-primary"
      />
      <span>
        {{ t('checkout.coupon.automatic') }}:
        <span class="font-medium">
          <template v-if="modelValue.freeShipping">{{ t('checkout.coupon.freeShipping') }}</template>
          <template v-else>−{{ formatMoney(modelValue.discountAmount, currency, locale) }}</template>
        </span>
        <span class="text-muted"> ({{ modelValue.code }})</span>
      </span>
    </div>

    <!-- Manually-applied state: show the code + discount with a remove button -->
    <div
      v-if="modelValue && !modelValue.isAutomatic"
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
          <template v-if="modelValue.freeShipping">{{ t('checkout.coupon.freeShipping') }}</template>
          <template v-else>−{{ formatMoney(modelValue.discountAmount, currency, locale) }}</template>
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

    <!-- Entry state: input + apply (also shown alongside an automatic, so the
         customer can still try a code — the backend returns whichever is bigger). -->
    <form
      v-if="!modelValue || modelValue.isAutomatic"
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
