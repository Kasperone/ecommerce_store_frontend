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
const auth = useAuthStore()

// Out of stock blocks the button only when backorder isn't allowed.
const outOfStock = computed(() => props.product.stock <= 0 && !props.product.allow_backorder)
const isBackorder = computed(() => props.product.stock <= 0 && props.product.allow_backorder)
// Impersonation is view-only — don't let an admin build the customer's cart.
const disabled = computed(() => outOfStock.value || auth.isImpersonating)

function addToCart() {
  if (auth.isImpersonating) return
  cart.add(props.product)
  cart.openDrawer()
}
</script>

<template>
  <UButton
    color="primary"
    icon="i-lucide-shopping-cart"
    :block="block"
    :disabled="disabled"
    :title="auth.isImpersonating ? t('impersonation.writeBlocked') : undefined"
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
