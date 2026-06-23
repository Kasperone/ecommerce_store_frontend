<script setup lang="ts">
/**
 * Shipping-method picker that sits between the shipping form and the order
 * summary on `/checkout`. Reads `useShippingQuote` reactively against the
 * caller-provided country / currency / subtotal, renders a radio list, and
 * emits the chosen method id back up. Empty state ("we don't ship to X") is
 * the canonical signal from the backend — never a 404.
 */

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { countryName } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'

const props = defineProps<{
  /** ISO-2 (uppercase) from the shipping form's country select. Empty until picked. */
  country: string
  /** USD / PLN / EUR — the cart's selected currency. */
  currency: CurrencyCode
  /** Cart subtotal in `currency` — drives free-above + tier resolution. */
  subtotal: number
  /**
   * Cart total weight in kg — drives weight-tier resolution. Optional; defaults
   * to 0 (legacy NULL-weight carts → weight branch skipped, subtotal-only
   * resolution preserved).
   */
  weightKg?: number
  /**
   * Cart total volume in cm³ (pre-summed by the checkout page from per-line
   * `length × width × height × quantity`). Threaded through to the quote so
   * the backend can compute `max(actual, volumetric)` against the resolved
   * zone's divisor. Optional; defaults to 0 (legacy un-dimensioned carts +
   * zones with NULL divisor stay on actual-weight pricing).
   */
  cartVolumeCm3?: number
  /** Currently-selected method id (lifted state). `null` until the user picks one. */
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  /**
   * Resolved shipping amount for the chosen method (free-above + tiers
   * already applied by the backend). 0 when no method is selected. The page
   * uses this to render the Shipping line in the order summary aside
   * without re-running the quote.
   */
  'update:methodAmount': [amount: number]
  /**
   * The chosen method's ``code`` (or null). Lets the checkout show the InPost
   * Geowidget point-picker when an InPost-locker method (``inpost_*``) is picked.
   */
  'update:methodCode': [code: string | null]
}>()

const { t, locale } = useI18n()

const quoteParams = computed(() => ({
  country: props.country,
  currency: props.currency,
  subtotal: props.subtotal,
  weightKg: props.weightKg ?? 0,
  cartVolumeCm3: props.cartVolumeCm3 ?? 0,
}))

const { methods, loading, failed } = useShippingQuote(quoteParams)

// Mirror the modelValue so v-model works with `<URadioGroup v-model=...>`.
const selectedId = ref<number | null>(props.modelValue)
watch(() => props.modelValue, (next) => {
  selectedId.value = next
})
watch(selectedId, (next) => {
  emit('update:modelValue', next)
  const picked = methods.value.find(m => m.id === next)
  emit('update:methodAmount', picked ? picked.amount : 0)
  emit('update:methodCode', picked?.code ?? null)
})

// When the methods list itself changes (re-quoted on country/currency switch)
// the selected method's amount may have moved (think: subtotal crossed the
// free-above threshold) — re-emit to keep the summary in sync.
watch(methods, (list) => {
  const picked = list.find(m => m.id === selectedId.value)
  emit('update:methodAmount', picked ? picked.amount : 0)
  emit('update:methodCode', picked?.code ?? null)
})

// Reset the selection when the available methods change (country/currency
// switch invalidates a previously-picked id) — pick the cheapest by default,
// or null when the list is empty. Predictable + nudges the customer toward
// the lower-cost option. `immediate: true` so the initial render already has
// a selection when methods arrive (otherwise the page sits with "Place order"
// disabled until the user clicks something, which is annoying when a single
// method is offered).
watch(methods, (list) => {
  if (list.length === 0) {
    selectedId.value = null
    return
  }
  const stillValid = list.some(m => m.id === selectedId.value)
  if (!stillValid) {
    const cheapest = [...list].sort((a, b) => a.amount - b.amount)[0]
    selectedId.value = cheapest ? cheapest.id : null
  }
}, { immediate: true })

const localizedCountry = computed(() =>
  countryName(props.country, locale.value as SupportedLocale),
)

const items = computed(() =>
  methods.value.map(m => ({
    value: m.id,
    label: m.name,
    description: m.description,
    amount: m.amount,
    isFree: m.is_free,
    freeAbove: m.free_above_subtotal,
    code: m.code,
  })),
)

function priceLabel(amount: number, isFree: boolean): string {
  if (isFree || amount === 0) return t('checkout.shipping.free')
  return formatMoney(amount, props.currency, locale.value)
}

function freeAboveHint(amount: number | null | undefined): string | null {
  if (amount == null) return null
  // PL conversion nudge: "Do darmowej dostawy brakuje X" — how much MORE the
  // cart needs, not the bare threshold. Only rendered for not-yet-free methods
  // (see the template gate), so the remainder is always positive.
  const remaining = amount - props.subtotal
  if (remaining <= 0) return null
  return t('checkout.shipping.freeAboveRemaining', {
    amount: formatMoney(remaining, props.currency, locale.value),
  })
}
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
    data-testid="shipping-method-selector"
  >
    <h3 class="mb-3 text-sm font-semibold">
      {{ t('checkout.shipping.selectMethod') }}
    </h3>

    <!-- Country not yet picked -->
    <p
      v-if="!country"
      class="text-sm text-muted"
    >
      {{ t('checkout.shipping.selectCountryFirst') }}
    </p>

    <!-- Active request -->
    <p
      v-else-if="loading && methods.length === 0"
      class="text-sm text-muted"
    >
      {{ t('actions.loading') }}
    </p>

    <!-- Backend errored — surface the inline notice; don't block the page -->
    <UAlert
      v-else-if="failed"
      color="warning"
      variant="subtle"
      :title="t('checkout.shipping.fetchError')"
    />

    <!-- Country isn't covered by any zone -->
    <p
      v-else-if="methods.length === 0"
      class="text-sm text-muted"
    >
      {{ t('checkout.shipping.noMethods', { country: localizedCountry }) }}
    </p>

    <!-- Method list -->
    <fieldset
      v-else
      class="space-y-2"
    >
      <legend class="sr-only">
        {{ t('checkout.shipping.selectMethod') }}
      </legend>
      <label
        v-for="item in items"
        :key="item.value"
        class="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
        :class="{ 'border-primary': selectedId === item.value }"
      >
        <span class="flex items-start gap-3">
          <input
            v-model="selectedId"
            type="radio"
            :value="item.value"
            :name="`shipping-method-${$.uid}`"
            class="mt-1"
          >
          <span>
            <span class="block text-sm font-medium">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="block text-xs text-muted"
            >{{ item.description }}</span>
            <span
              v-if="freeAboveHint(item.freeAbove) && !item.isFree"
              class="block text-xs text-muted"
            >{{ freeAboveHint(item.freeAbove) }}</span>
          </span>
        </span>
        <span class="text-sm font-semibold">
          {{ priceLabel(item.amount, item.isFree) }}
        </span>
      </label>
    </fieldset>
  </div>
</template>
