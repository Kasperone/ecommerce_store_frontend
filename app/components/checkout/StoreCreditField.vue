<script setup lang="ts">
/**
 * Store-credit tender toggle on `/checkout`. Store credit is inherently
 * authed-only (D8) and single-currency (D3): this renders only when the public
 * `store_credit_enabled` toggle is on, the customer is signed in, AND they hold
 * a positive balance in the order currency. Otherwise it renders nothing (and
 * releases any prior opt-in so the payload never carries a stale
 * `use_store_credit`).
 *
 * Store credit applies AFTER the gift card (D10): the parent passes `remaining`
 * (the order total minus whatever the gift card covers), and the applied amount
 * is `min(balance, remaining)`. Both the checkbox state and the applied amount
 * are lifted so the page can show the summary line + set `use_store_credit`.
 * The applied amount is advisory — the backend recomputes at order create.
 */

import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { tenderCoverage } from '#shared/utils/giftCard'

const props = defineProps<{
  /** The order currency — selects the matching per-currency account. */
  currency: CurrencyCode
  /** Order total left to pay after the gift card (store credit covers this). */
  remaining: number
  /** Whether the customer has opted to spend store credit (lifted state). */
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:applied': [value: number]
}>()

const { t, locale } = useI18n()
const authStore = useAuthStore()
const storeConfig = useStoreConfig()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const { data: summary } = useMyStoreCreditQuery(() => isAuthenticated.value)

// Balance in the order currency (0 when no account for it exists).
const balance = computed(
  () => summary.value?.accounts.find(a => a.currency === props.currency)?.balance ?? 0,
)

// D7/D8: toggle on + signed in + a positive same-currency balance.
const available = computed(() =>
  storeConfig.data.value?.store_credit_enabled === true
  && isAuthenticated.value
  && balance.value > 0,
)

// What ticking the box would spend: min(balance, remaining) (D10).
const applied = computed(() =>
  available.value && props.modelValue ? tenderCoverage(balance.value, props.remaining) : 0,
)

// Keep the lifted applied amount in sync (drives the summary + amount_due).
watch(applied, value => emit('update:applied', value), { immediate: true })

// If the field gates out (currency switch to a zero-balance currency, sign-out),
// release a prior opt-in so the payload never sends a stale `use_store_credit`.
watch(available, (isAvailable) => {
  if (!isAvailable && props.modelValue) emit('update:modelValue', false)
})

function onToggle(value: boolean) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div
    v-if="available"
    class="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
    data-testid="store-credit-field"
  >
    <UCheckbox
      :model-value="modelValue"
      data-testid="store-credit-toggle"
      @update:model-value="onToggle"
    >
      <template #label>
        <span class="flex flex-wrap items-center gap-1">
          <UIcon
            name="i-lucide-wallet"
            class="text-primary"
          />
          {{ t('checkout.storeCredit.toggle') }}
          <span class="text-muted">
            ({{ t('checkout.storeCredit.balance') }}:
            {{ formatMoney(balance, currency, locale) }})
          </span>
        </span>
      </template>
    </UCheckbox>
    <p
      v-if="modelValue && applied > 0"
      class="mt-1 text-xs text-primary"
      data-testid="store-credit-applies"
    >
      {{ t('checkout.storeCredit.applies', { amount: formatMoney(applied, currency, locale) }) }}
    </p>
  </div>
</template>
