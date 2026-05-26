<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, selectPrice } from '#shared/utils/money'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const { currency } = useCurrencyPreference()

const open = computed({
  get: () => cart.isOpen,
  set: value => (value ? cart.openDrawer() : cart.closeDrawer()),
})

const subtotal = computed(() => {
  const total = cart.items.reduce((sum, item) => {
    const picked = selectPrice(item, currency.value)
    return sum + (picked ? picked.amount * item.quantity : 0)
  }, 0)
  return formatMoney(total, currency.value, locale.value)
})

function goToCart() {
  cart.closeDrawer()
  void navigateTo(localePath('/cart'))
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('cart.title')"
    :description="t('cart.subtitle')"
  >
    <template #body>
      <div
        v-if="cart.isEmpty"
        class="flex flex-col items-center gap-4 py-12 text-center"
      >
        <UIcon
          name="i-lucide-shopping-cart"
          class="size-10 text-muted"
        />
        <p class="text-muted">
          {{ t('cart.empty') }}
        </p>
        <UButton
          color="primary"
          variant="soft"
          @click="cart.closeDrawer()"
        >
          {{ t('cart.emptyCta') }}
        </UButton>
      </div>

      <div
        v-else
        class="divide-y divide-gray-100 dark:divide-gray-800"
      >
        <CartLineItem
          v-for="item in cart.items"
          :key="item.productId"
          :item="item"
        />
      </div>
    </template>

    <template
      v-if="!cart.isEmpty"
      #footer
    >
      <div class="w-full space-y-3">
        <div class="flex items-center justify-between font-medium">
          <span>{{ t('cart.summary.subtotal') }}</span>
          <span>{{ subtotal }}</span>
        </div>
        <UButton
          color="primary"
          block
          disabled
          :title="t('actions.comingSoon')"
        >
          {{ t('cart.actions.checkout') }}
        </UButton>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="soft"
            block
            @click="goToCart"
          >
            {{ t('cart.actions.viewCart') }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            block
            @click="cart.closeDrawer()"
          >
            {{ t('cart.actions.continueShopping') }}
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
