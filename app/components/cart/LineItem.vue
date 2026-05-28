<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CartItem } from '~/stores/cart'
import { formatMoney, selectPrice } from '#shared/utils/money'

const props = defineProps<{ item: CartItem }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const { currency } = useCurrencyPreference()

const to = computed(() => localePath(`/products/${props.item.slug}`))
// Backorder lines have no stock ceiling, so the "+" stepper never caps.
const atMax = computed(() => !props.item.allowBackorder && props.item.quantity >= props.item.stock)

const lineTotal = computed(() => {
  const picked = selectPrice(props.item, currency.value)
  return picked
    ? formatMoney(picked.amount * props.item.quantity, picked.currency, locale.value)
    : null
})
</script>

<template>
  <div class="flex gap-3 py-3">
    <NuxtLink
      :to="to"
      :aria-label="item.name"
      class="size-16 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
    >
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        :alt="item.name"
        class="h-full w-full object-cover"
      >
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
            @click="cart.setQuantity(item.productId, item.quantity - 1)"
          />
          <span class="min-w-8 text-center text-sm">{{ item.quantity }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-plus"
            :disabled="atMax"
            :aria-label="t('cart.item.increase')"
            @click="cart.setQuantity(item.productId, item.quantity + 1)"
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
      @click="cart.remove(item.productId)"
    />
  </div>
</template>
