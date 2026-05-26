<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const cart = useCartStore()
</script>

<template>
  <UChip
    :text="cart.count"
    :show="cart.count > 0"
    size="3xl"
    color="primary"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-shopping-cart"
      class="cursor-pointer"
      :aria-label="t('cart.actions.open')"
      @click="cart.openDrawer()"
    />
  </UChip>
</template>
