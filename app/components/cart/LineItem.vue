<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CartItem } from '~/stores/cart'
import { localizedCartVariantTitle } from '#shared/utils/localizedProduct'
import { formatMoney, selectPrice } from '#shared/utils/money'

const props = defineProps<{ item: CartItem }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const { currency } = useCurrencyPreference()
const { removeFromCart } = useEcommerceTracking()

const to = computed(() => localePath(`/products/${props.item.slug}`))
// Variant lines show their localized title ("Red / XL") under the name.
const variantLabel = computed(() => localizedCartVariantTitle(props.item, locale.value))
// Line identity is the (productId, variantId) pair — old persisted lines have
// no variantId key, normalized to null.
const variantId = computed(() => props.item.variantId ?? null)
// Backorder lines have no stock ceiling, so the "+" stepper never caps.
const atMax = computed(() => !props.item.allowBackorder && props.item.quantity >= props.item.stock)

const lineTotal = computed(() => {
  const picked = selectPrice(props.item, currency.value)
  return picked
    ? formatMoney(picked.amount * props.item.quantity, picked.currency, locale.value)
    : null
})

// GA4 remove_from_cart. Decrement reports a single unit removed; the trash
// button reports the whole line quantity. Fire the event THEN mutate the cart
// so the line snapshot is still intact when we build the analytics item.
function decrement() {
  removeFromCart({ ...props.item, quantity: 1 })
  cart.setQuantity(props.item.productId, variantId.value, props.item.quantity - 1)
}

function removeLine() {
  removeFromCart({ ...props.item })
  cart.remove(props.item.productId, variantId.value)
}
</script>

<template>
  <div class="flex gap-3 py-3">
    <NuxtLink
      :to="to"
      :aria-label="item.name"
      class="size-16 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
    >
      <NuxtImg
        v-if="item.imageUrl"
        :src="item.imageUrl"
        :alt="item.name"
        width="64"
        height="64"
        loading="lazy"
        class="h-full w-full object-cover"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-muted"
      >
        <UIcon
          name="i-lucide-image"
          class="size-6"
        />
      </div>
    </NuxtLink>

    <div class="flex flex-1 flex-col gap-1">
      <NuxtLink
        :to="to"
        class="line-clamp-2 text-sm font-medium hover:text-primary"
      >
        {{ item.name }}
      </NuxtLink>
      <p
        v-if="variantLabel"
        class="text-xs text-muted"
        data-testid="line-variant-title"
      >
        {{ variantLabel }}
      </p>
      <ShopPriceDisplay
        :product="item"
        size="sm"
      />

      <div class="mt-1 flex items-center justify-between gap-2">
        <div class="flex items-center rounded-md border border-gray-200 dark:border-gray-800">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-minus"
            :aria-label="t('cart.item.decrease')"
            @click="decrement"
          />
          <span class="min-w-8 text-center text-sm">{{ item.quantity }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-plus"
            :disabled="atMax"
            :aria-label="t('cart.item.increase')"
            @click="cart.setQuantity(item.productId, variantId, item.quantity + 1)"
          />
        </div>
        <span
          v-if="lineTotal"
          class="text-sm font-medium"
        >{{ lineTotal }}</span>
      </div>
    </div>

    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-trash-2"
      :aria-label="t('cart.actions.remove')"
      @click="removeLine"
    />
  </div>
</template>
