<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'

/**
 * "Request a quote" CTA for the cart (B2B accounts only).
 *
 * Auto-imports as <AccountQuotesCartCta> (pathPrefix). Shown only when the
 * caller is a B2B account (`GET /companies/me` 200). Clicking posts the current
 * cart lines `{ currency, items: [{ product_id, quantity }] }` to `POST /quotes`
 * (the server re-prices each line) and navigates to the new quote's detail page.
 * Non-B2B users never see it — the whole component renders nothing.
 */

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const cart = useCartStore()
const { currency } = useCurrencyPreference()
const { isB2B } = useCompanyContext()
const requestMutation = useRequestQuote()

const isSubmitting = ref(false)

async function onRequest() {
  if (cart.isEmpty || isSubmitting.value) return
  isSubmitting.value = true
  try {
    const quote = await requestMutation.mutateAsync({
      currency: currency.value,
      items: cart.items.map(item => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    })
    await navigateTo(localePath(`/account/quotes/${quote.id}`))
  }
  catch (err) {
    toast.add({
      title: t('cart.requestQuote.error'),
      description: parseProblem(err).detail,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UButton
    v-if="isB2B"
    class="mt-2"
    color="primary"
    variant="soft"
    block
    icon="i-lucide-file-text"
    :loading="isSubmitting"
    data-testid="request-quote-cta"
    @click="onRequest"
  >
    {{ t('cart.requestQuote.button') }}
  </UButton>
</template>
