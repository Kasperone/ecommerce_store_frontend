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

const outOfStock = computed(() => props.product.stock <= 0)

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
    {{ outOfStock ? t('stock.outOfStock') : t('actions.addToCart') }}
  </UButton>
</template>
