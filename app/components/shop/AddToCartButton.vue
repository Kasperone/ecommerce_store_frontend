<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse, ProductVariantPublic, ProductWithCategory } from '#shared/types/api'

const props = defineProps<{
  product: ProductResponse | ProductWithCategory
  /**
   * Resolved variant (variants F2). A variant product without one (option
   * pills not fully selected — or a product card, which never resolves one)
   * disables the button with a "Select options" label so a product-grain
   * line can never reach the cart (the backend 422s it at order create).
   */
  variant?: ProductVariantPublic | null
  block?: boolean
  /**
   * Gift cards v2: when the product is a gift card, the PDP passes the shopper's
   * per-line delivery fields (blank recipient ⇒ backend defaults to the buyer
   * email). Threaded onto the cart line → order-create payload.
   */
  giftCardRecipientEmail?: string | null
  giftCardMessage?: string | null
  /**
   * External gate (e.g. an invalid gift-card recipient email on the PDP) that
   * disables the button on top of the stock/selection rules.
   */
  blocked?: boolean
}>()

const { t } = useI18n()
const cart = useCartStore()
const auth = useAuthStore()
const { addToCart: trackAddToCart } = useEcommerceTracking()

const needsSelection = computed(() => props.product.has_variants === true && !props.variant)
// Stock grain follows the line: the variant's stock when one is resolved.
const stock = computed(() => (props.variant ? props.variant.stock : props.product.stock))
// Out of stock blocks the button only when backorder isn't allowed.
const outOfStock = computed(
  () => !needsSelection.value && stock.value <= 0 && !props.product.allow_backorder,
)
const isBackorder = computed(
  () => !needsSelection.value && stock.value <= 0 && props.product.allow_backorder,
)
// Impersonation is view-only — don't let an admin build the customer's cart.
const disabled = computed(
  () => needsSelection.value || outOfStock.value || auth.isImpersonating || props.blocked === true,
)

function addToCart() {
  if (auth.isImpersonating || needsSelection.value || props.blocked) return
  const variant = props.variant ?? null
  const giftCard = props.product.is_gift_card
    ? { recipientEmail: props.giftCardRecipientEmail, message: props.giftCardMessage }
    : null
  cart.add(props.product, 1, variant, giftCard)
  // GA4 add_to_cart — report a single-unit add of the resulting cart line so
  // the analytics value matches the line's effective per-currency price.
  const line = cart.items.find(
    i => i.productId === props.product.id && (i.variantId ?? null) === (variant?.id ?? null),
  )
  if (line) trackAddToCart({ ...line, quantity: 1 })
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
    <template v-if="needsSelection">
      {{ t('variants.selectOptions') }}
    </template>
    <template v-else-if="outOfStock">
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
