<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * Payment-method picker for a pending order: starts the chosen provider's hosted
 * checkout and sends the buyer there via `navigateTo(external)`. Used on the
 * post-checkout success page and on any pending order's detail page.
 *
 * Both providers degrade gracefully: a backend error (503 not-configured /
 * 502 upstream / 404 / 409) is rendered inline via `<ErrorAlert>` instead of
 * navigating, so an environment without a provider's keys shows a readable
 * notice rather than a dead button.
 */
const props = defineProps<{ orderId: number }>()

const { t } = useI18n()
const payu = useStartPayuCheckout()
const stripe = useStartStripeCheckout()
const error = ref<ProblemDetails | null>(null)

async function payWithStripe() {
  error.value = null
  try {
    const { checkout_url } = await stripe.mutateAsync(props.orderId)
    await navigateTo(checkout_url, { external: true })
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}

async function payWithPayu() {
  error.value = null
  try {
    const { redirect_uri } = await payu.mutateAsync(props.orderId)
    await navigateTo(redirect_uri, { external: true })
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}
</script>

<template>
  <div class="space-y-3">
    <ErrorAlert
      v-if="error"
      :problem="error"
    />
    <div class="flex flex-col gap-2">
      <UButton
        color="primary"
        icon="i-lucide-credit-card"
        block
        :loading="stripe.isLoading.value"
        @click="payWithStripe"
      >
        {{ t('payment.methods.stripe') }}
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-wallet"
        block
        :loading="payu.isLoading.value"
        @click="payWithPayu"
      >
        {{ t('payment.methods.payu') }}
      </UButton>
    </div>
  </div>
</template>
