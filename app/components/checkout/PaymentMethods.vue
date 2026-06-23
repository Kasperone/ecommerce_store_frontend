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
 *
 * Above the redirect buttons sits `<CheckoutWalletButton>` — an in-page Apple
 * Pay / Google Pay / Link widget. It renders nothing unless Stripe is
 * configured and the device offers a wallet, so it never crowds the redirect
 * options in a keyless env. The amount/currency/order_number it needs are
 * threaded through from the parent (which holds the full order).
 */
const props = defineProps<{
  orderId: number
  amountMinor: number
  currency: string
  orderNumber: string
  /**
   * Guest orders only (user_id = null): the order's tracking token, threaded
   * into the checkout-start calls as `?guest_token=` so the anonymous buyer
   * can pay without a bearer. Omit/null for authed orders.
   */
  guestToken?: string | null
}>()

const { t } = useI18n()
const payu = useStartPayuCheckout()
const stripe = useStartStripeCheckout()
const error = ref<ProblemDetails | null>(null)

// Accepted-method marks shown as a trust row. Brand names (not translated);
// BLIK + Przelewy24 are the dominant PL methods, surfaced explicitly here and on
// the (primary) PayU button so they aren't buried behind a generic gateway name.
const acceptedMarks = ['BLIK', 'Przelewy24', 'Visa', 'Mastercard']

async function payWithStripe() {
  error.value = null
  try {
    const { checkout_url } = await stripe.mutateAsync({
      orderId: props.orderId,
      guestToken: props.guestToken,
    })
    await navigateTo(checkout_url, { external: true })
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}

async function payWithPayu() {
  error.value = null
  try {
    const { redirect_uri } = await payu.mutateAsync({
      orderId: props.orderId,
      guestToken: props.guestToken,
    })
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
    <ClientOnly>
      <CheckoutWalletButton
        :order-id="orderId"
        :amount-minor="amountMinor"
        :currency="currency"
        :order-number="orderNumber"
        :guest-token="guestToken"
      />
    </ClientOnly>
    <div class="flex flex-col gap-2">
      <!-- PayU first + primary: it carries BLIK / Przelewy24, the dominant PL
           methods, so it leads on a mainly-Polish storefront. -->
      <UButton
        color="primary"
        icon="i-lucide-wallet"
        block
        :loading="payu.isLoading.value"
        @click="payWithPayu"
      >
        {{ t('payment.methods.payu') }}
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-credit-card"
        block
        :loading="stripe.isLoading.value"
        @click="payWithStripe"
      >
        {{ t('payment.methods.stripe') }}
      </UButton>
    </div>
    <!-- Accepted-method marks — a trust signal that BLIK + Przelewy24 are
         available (the actual pick happens on the gateway's hosted page). -->
    <div class="flex flex-wrap items-center justify-center gap-1.5 pt-1">
      <span class="text-xs text-muted">{{ t('payment.acceptedLabel') }}:</span>
      <span
        v-for="mark in acceptedMarks"
        :key="mark"
        class="rounded border border-default px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
      >{{ mark }}</span>
    </div>
  </div>
</template>
