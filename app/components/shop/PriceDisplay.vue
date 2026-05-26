<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse } from '#shared/types/api'
import { formatMoney, selectPrice } from '#shared/utils/money'

/**
 * Renders a product's price in the shopper's chosen currency
 * (`useCurrencyPreference`), formatted for the active locale. Falls back to
 * another currency column when the chosen one is null (see `selectPrice`).
 */
const props = defineProps<{
  product: Pick<ProductResponse, 'price_usd' | 'price_pln' | 'price_eur'>
  size?: 'sm' | 'lg'
}>()

const { locale } = useI18n()
const { currency } = useCurrencyPreference()

const formatted = computed(() => {
  const picked = selectPrice(props.product, currency.value)
  return picked ? formatMoney(picked.amount, picked.currency, locale.value) : null
})
</script>

<template>
  <span
    v-if="formatted"
    :class="size === 'lg' ? 'text-2xl font-semibold' : 'font-medium'"
  >
    {{ formatted }}
  </span>
  <span
    v-else
    class="text-muted text-sm"
  >—</span>
</template>
