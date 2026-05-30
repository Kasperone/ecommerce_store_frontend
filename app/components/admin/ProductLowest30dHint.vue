<script setup lang="ts">
/**
 * Admin decision-support: the OMNIBUS "lowest 30d" floor next to a price input.
 *
 * Unlike the storefront ``<ShopOmnibusPrice>`` (which only renders when the
 * lowest is *lower* than current — the legal display rule), this hint renders
 * *whenever a history exists*. The admin wants to know the floor before
 * announcing a "discount" — that floor is the lowest in the last 30 days,
 * regardless of where the current price sits.
 *
 * Skips for create mode (no ``productId``) + skips when there's no history yet
 * (a freshly created product hasn't been through a price change).
 *
 * Auto-imported as ``<AdminProductLowest30dHint>`` (pathPrefix).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProductLowest30d } from '#imports'

const props = defineProps<{
  productId?: number
  currency: 'USD' | 'PLN' | 'EUR'
}>()

const { t, locale } = useI18n()

// useAsyncData composables need an id at setup time; the storefront
// pattern doesn't await create-mode calls. Skip the fetch when there's no
// product to look up.
const enabled = computed(() => typeof props.productId === 'number')
const { data } = enabled.value
  ? await useProductLowest30d(props.productId!, computed(() => props.currency))
  : { data: ref(null) as Ref<{ lowest_price: number | null, since: string | null } | null> }

const formatted = computed(() => {
  if (!data.value || data.value.lowest_price == null || data.value.since == null) {
    return null
  }
  // Match the admin form's existing Intl.NumberFormat usage for currency.
  const price = new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: props.currency,
  }).format(data.value.lowest_price)
  const date = new Date(data.value.since).toLocaleDateString(locale.value)
  return { price, date }
})
</script>

<template>
  <p
    v-if="formatted"
    class="text-xs text-muted mt-1"
    data-testid="admin-lowest30d-hint"
  >
    {{ t('admin.products.hints.lowest30d', { price: formatted.price, date: formatted.date }) }}
  </p>
</template>
