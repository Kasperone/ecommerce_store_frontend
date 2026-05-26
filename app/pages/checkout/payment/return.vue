<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * PayU's `continueUrl` lands the buyer here after they finish (or abandon) the
 * hosted payment page, with `?order=<order_number>`. The redirect is NOT
 * authoritative — PayU settles the order server-to-server via the signed
 * webhook, which may arrive slightly before or after this page loads. So we
 * show a "confirming your payment" notice and point the buyer at their orders,
 * where the settled status appears once the webhook lands.
 */
definePageMeta({ middleware: 'user' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const orderNumber = computed(() => {
  const o = route.query.order
  return typeof o === 'string' ? o : undefined
})

useHead({ title: () => t('payment.return.title') })
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <UIcon
        name="i-lucide-clock-3"
        class="mx-auto mb-4 size-12 text-primary"
      />
      <h1 class="text-2xl font-bold">
        {{ t('payment.return.title') }}
      </h1>
      <p class="mt-3 text-muted">
        {{ t('payment.return.message') }}
      </p>
      <p
        v-if="orderNumber"
        class="mt-2 text-sm text-muted"
      >
        {{ t('payment.return.orderRef', { number: orderNumber }) }}
      </p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <UButton
          color="primary"
          :to="localePath('/account/orders')"
        >
          {{ t('payment.return.viewOrders') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          :to="localePath('/products')"
        >
          {{ t('cart.actions.continueShopping') }}
        </UButton>
      </div>
    </div>
  </NuxtLayout>
</template>
