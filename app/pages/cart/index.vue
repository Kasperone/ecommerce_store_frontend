<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, selectPrice } from '#shared/utils/money'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const { currency } = useCurrencyPreference()

useHead({ title: () => t('cart.title') })

const subtotal = computed(() => {
  const total = cart.items.reduce((sum, item) => {
    const picked = selectPrice(item, currency.value)
    return sum + (picked ? picked.amount * item.quantity : 0)
  }, 0)
  return formatMoney(total, currency.value, locale.value)
})
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 class="mb-6 text-2xl font-bold">
        {{ t('cart.title') }}
      </h1>

      <!-- The cart is client-only state; render it client-side to avoid an SSR
           hydration mismatch (server has an empty cart). -->
      <ClientOnly>
        <div
          v-if="cart.isEmpty"
          class="flex flex-col items-center gap-4 py-16 text-center"
        >
          <UIcon
            name="i-lucide-shopping-cart"
            class="size-12 text-muted"
          />
          <p class="text-muted">
            {{ t('cart.empty') }}
          </p>
          <UButton
            color="primary"
            :to="localePath('/products')"
          >
            {{ t('cart.emptyCta') }}
          </UButton>
        </div>

        <div
          v-else
          class="grid gap-8 lg:grid-cols-3"
        >
          <div class="divide-y divide-gray-100 lg:col-span-2 dark:divide-gray-800">
            <CartLineItem
              v-for="item in cart.items"
              :key="item.productId"
              :item="item"
            />
          </div>

          <aside class="h-fit rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <h2 class="mb-3 font-semibold">
              {{ t('cart.summary.heading') }}
            </h2>
            <div class="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <span class="text-muted">{{ t('cart.summary.subtotal') }}</span>
              <span class="font-medium">{{ subtotal }}</span>
            </div>
            <UButton
              class="mt-4"
              color="primary"
              block
              disabled
              :title="t('actions.comingSoon')"
            >
              {{ t('cart.actions.checkout') }}
            </UButton>
            <UButton
              class="mt-2"
              color="neutral"
              variant="ghost"
              block
              :to="localePath('/products')"
            >
              {{ t('cart.actions.continueShopping') }}
            </UButton>
          </aside>
        </div>

        <template #fallback>
          <div class="py-16 text-center text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
