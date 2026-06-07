<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse, ProductVariantPublic } from '#shared/types/api'
import { formatMoney, selectPrice } from '#shared/utils/money'

/**
 * Renders a product's price in the shopper's chosen currency
 * (`useCurrencyPreference`), formatted for the active locale. Falls back to
 * another currency column when the chosen one is null (see `selectPrice`).
 *
 * Variants (F2): when a `variant` is passed (PDP, after the shopper resolves
 * the option pills) its effective prices win. Without one, a variant product
 * (`has_variants`) shows the product's base price with a "From" prefix —
 * the product columns are the base/from price by design (plan risk 6).
 */
const props = defineProps<{
  product: Pick<ProductResponse, 'price_usd' | 'price_pln' | 'price_eur'>
    & { has_variants?: boolean }
  variant?: ProductVariantPublic | null
  size?: 'sm' | 'lg'
}>()

const { t, locale } = useI18n()
const { currency } = useCurrencyPreference()

const formatted = computed(() => {
  const picked = selectPrice(props.variant ?? props.product, currency.value)
  return picked ? formatMoney(picked.amount, picked.currency, locale.value) : null
})

const showFrom = computed(() => props.variant == null && props.product.has_variants === true)
</script>

<template>
  <span
    v-if="formatted"
    :class="size === 'lg' ? 'text-2xl font-semibold' : 'font-medium'"
  >
    <template v-if="showFrom">{{ t('price.from', { price: formatted }) }}</template>
    <template v-else>{{ formatted }}</template>
  </span>
  <span
    v-else
    class="text-muted text-sm"
  >—</span>
</template>
