<script setup lang="ts">
/**
 * Gift-card redemption field on `/checkout`. Renders only when the public
 * `gift_cards_enabled` toggle is on (D7 — the feature ships dark). The customer
 * types a code and hits Apply; we preview the balance via
 * `POST /api/v1/gift-cards/check { code, currency }` and emit the applied
 * `{ code, last4, balance, currency }` up to the page, which threads `code`
 * onto the create-order payload (`gift_card_code`) and shows the coverage in the
 * summary.
 *
 * A gift card is single-currency (D3): a currency switch re-checks the applied
 * code against the new currency and clears it (with the backend's
 * `gift_card_currency_mismatch` reason) when it no longer applies, so the
 * displayed coverage never diverges from what checkout will actually redeem.
 * The preview is advisory — the backend re-validates and debits at order create
 * (D5), failing loud with the same machine codes.
 *
 * We keep the plaintext `code` in the applied model (the check response only
 * carries `last4`) because the order-create payload needs it; it never leaves
 * this tab otherwise.
 */

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { maskGiftCardCode, tenderCoverage, giftCardCheckErrorKey } from '#shared/utils/giftCard'
import { parseProblem } from '#shared/utils/problemDetails'

export interface AppliedGiftCard {
  /** Plaintext code — sent as `gift_card_code` at order create. */
  code: string
  /** Masked-code display suffix. */
  last4: string
  /** Remaining balance in `currency`. */
  balance: number
  /** The card's currency (== the order currency; single-currency, D3). */
  currency: string
}

const props = defineProps<{
  /** The order currency the card is redeemed against. */
  currency: CurrencyCode
  /** Current order total — the card covers `min(balance, total)`. */
  orderTotal: number
  /** Currently-applied gift card (lifted state). `null` when none. */
  modelValue: AppliedGiftCard | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AppliedGiftCard | null]
}>()

const { t, locale } = useI18n()
const storeConfig = useStoreConfig()
const checkGiftCard = useCheckGiftCard()

// D7: rendered only when the public toggle is on. `useStoreConfig` is the same
// SSR-serialized public read the footer uses (deduped).
const enabled = computed(() => storeConfig.data.value?.gift_cards_enabled === true)

const code = ref('')
const error = ref<string | null>(null)

// Coverage preview — never more than the balance or the running total.
const coverage = computed(() =>
  props.modelValue ? tenderCoverage(props.modelValue.balance, props.orderTotal) : 0,
)

function errorFor(err: unknown): string {
  const problem = parseProblem(err)
  return t(giftCardCheckErrorKey(problem?.detail, problem?.status))
}

async function apply() {
  const trimmed = code.value.trim()
  if (!trimmed) return
  error.value = null
  try {
    const result = await checkGiftCard.mutateAsync({ code: trimmed, currency: props.currency })
    emit('update:modelValue', {
      code: trimmed,
      last4: result.last4,
      balance: result.balance,
      currency: result.currency,
    })
    code.value = ''
  }
  catch (err) {
    emit('update:modelValue', null)
    error.value = errorFor(err)
  }
}

function remove() {
  emit('update:modelValue', null)
  error.value = null
}

// A currency switch invalidates a card denominated in another currency: re-check
// the applied code against the new currency and clear it (with the backend
// reason) when it stops applying. Only fires while a card is applied.
watch(
  () => props.currency,
  async (next, prev) => {
    if (next === prev) return
    const applied = props.modelValue
    if (!applied) return
    try {
      const result = await checkGiftCard.mutateAsync({ code: applied.code, currency: next })
      emit('update:modelValue', {
        code: applied.code,
        last4: result.last4,
        balance: result.balance,
        currency: result.currency,
      })
    }
    catch (err) {
      emit('update:modelValue', null)
      error.value = errorFor(err)
    }
  },
)
</script>

<template>
  <div
    v-if="enabled"
    data-testid="gift-card-field"
  >
    <!-- Applied state: masked code + balance + coverage, with a remove button. -->
    <div
      v-if="modelValue"
      class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-3"
      data-testid="gift-card-applied"
    >
      <span class="flex flex-col gap-0.5 text-sm">
        <span class="flex items-center gap-2">
          <UIcon
            name="i-lucide-gift"
            class="text-primary"
          />
          <span
            class="font-mono font-medium"
            data-testid="gift-card-masked"
          >{{ maskGiftCardCode(modelValue.last4) }}</span>
        </span>
        <span class="text-muted">
          {{ t('checkout.giftCard.balance') }}:
          {{ formatMoney(modelValue.balance, modelValue.currency as CurrencyCode, locale) }}
          ·
          <span
            class="text-primary"
            data-testid="gift-card-coverage"
          >−{{ formatMoney(coverage, currency, locale) }}</span>
        </span>
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-x"
        :aria-label="t('checkout.giftCard.remove')"
        data-testid="gift-card-remove"
        @click="remove"
      />
    </div>

    <!-- Entry state: input + apply. -->
    <form
      v-else
      class="flex items-start gap-2"
      data-testid="gift-card-entry"
      @submit.prevent="apply"
    >
      <div class="flex-1">
        <UInput
          v-model="code"
          :placeholder="t('checkout.giftCard.placeholder')"
          :aria-label="t('checkout.giftCard.label')"
          autocapitalize="characters"
          class="w-full"
          data-testid="gift-card-input"
        />
        <p
          v-if="error"
          class="mt-1 text-xs text-error"
          data-testid="gift-card-error"
        >
          {{ error }}
        </p>
      </div>
      <UButton
        type="submit"
        color="neutral"
        variant="subtle"
        :loading="checkGiftCard.isLoading.value"
        :disabled="!code.trim()"
        data-testid="gift-card-apply"
      >
        {{ t('checkout.giftCard.apply') }}
      </UButton>
    </form>
  </div>
</template>
