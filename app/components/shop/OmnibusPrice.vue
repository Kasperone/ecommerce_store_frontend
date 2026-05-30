<script setup lang="ts">
/**
 * OMNIBUS (Directive 98/6 Art. 6a) — "lowest price in the last 30 days"
 * comparison line shown under the product's current price on the storefront.
 *
 * Display rule (D1, confirmed at session start):
 *   Show when ``lowest_price !== null`` AND ``lowest_price < current_picked_price``.
 *   Otherwise render nothing (price hasn't dropped → no comparison to make).
 *
 * Uses the same ``selectPrice`` currency fallback as ``<ShopPriceDisplay>`` so
 * the line is always scoped to the currency the customer actually sees, even
 * when the active currency's column is null and we fell back to USD/PLN.
 *
 * Auto-imported as ``<ShopOmnibusPrice>`` (pathPrefix prepends ``shop/``).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProductLowest30d } from '#imports'
import type { ProductResponse } from '#shared/types/api'
import { formatMoney, selectPrice } from '#shared/utils/money'

const props = defineProps<{
  product: Pick<ProductResponse, 'id' | 'price_usd' | 'price_pln' | 'price_eur'>
}>()

const { t, locale } = useI18n()
const { currency: activeCurrency } = useCurrencyPreference()

// Mirror ShopPriceDisplay's `selectPrice` call so we compare against the
// currency the customer is actually seeing — not the one they picked, if the
// product doesn't have a price in it.
const picked = computed(() =>
  selectPrice(props.product, activeCurrency.value),
)

// The currency to fetch lowest-30d for; falls back to the picked currency
// (since the line is meaningless in a currency the product isn't priced in).
const lookupCurrency = computed(() => picked.value?.currency ?? activeCurrency.value)

// SSR-fetched so the comparison is in the crawlable HTML. Refetches when the
// shopper flips the currency picker.
const { data } = await useProductLowest30d(props.product.id, lookupCurrency)

const shouldRender = computed(() => {
  if (!picked.value || !data.value) return false
  const lowest = data.value.lowest_price
  if (lowest == null) return false
  // D1: render only when the comparison actually shows a drop.
  return lowest < picked.value.amount
})

const formattedLowest = computed(() => {
  if (!shouldRender.value || !picked.value || !data.value || data.value.lowest_price == null) {
    return null
  }
  return formatMoney(data.value.lowest_price, picked.value.currency, locale.value)
})
</script>

<template>
  <p
    v-if="shouldRender && formattedLowest"
    class="text-sm text-muted"
    data-testid="omnibus-line"
  >
    {{ t('omnibus.lowest30d', { price: formattedLowest }) }}
  </p>
</template>
