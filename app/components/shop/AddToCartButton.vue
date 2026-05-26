<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Add-to-cart affordance. Cart is Phase 2, so this renders disabled with a
 * "coming soon" tooltip — it's the single seam Phase 2 wires (the `productId`
 * prop is accepted now so call sites stay stable).
 */
defineProps<{
  productId?: number
  block?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <!-- Native `title` (not UTooltip) so the hint works on a disabled button and
       needs no TooltipProvider. Phase 2 enables this and wires the click. -->
  <UButton
    color="primary"
    icon="i-lucide-shopping-cart"
    :block="block"
    disabled
    :title="t('actions.comingSoon')"
  >
    {{ t('actions.addToCart') }}
  </UButton>
</template>
