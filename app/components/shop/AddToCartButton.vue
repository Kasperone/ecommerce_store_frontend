<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse, ProductWithCategory } from '#shared/types/api'

const props = defineProps<{
  product: ProductResponse | ProductWithCategory
  block?: boolean
}>()

const { t } = useI18n()
const cart = useCartStore()

// Out of stock blocks the button only when backorder isn't allowed.
const outOfStock = computed(() => props.product.stock <= 0 && !props.product.allow_backorder)
const isBackorder = computed(() => props.product.stock <= 0 && props.product.allow_backorder)

function addToCart() {
  cart.add(props.product)
  cart.openDrawer()
}
</script>

<template>
  <UButton
    color="primary"
    icon="i-lucide-shopping-cart"
    :block="block"
    :disabled="outOfStock"
    @click="addToCart"
  >
    <template v-if="outOfStock">
      {{ t('stock.outOfStock') }}
    </template>
    <template v-else-if="isBackorder">
      {{ t('stock.addBackorder') }}
    </template>
    <template v-else>
      {{ t('actions.addToCart') }}
    </template>
  </UButton>
</template>
