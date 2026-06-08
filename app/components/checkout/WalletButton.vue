<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// `/pure` defers injecting the Stripe.js <script> until loadStripe() is actually
// called — the bare entry eagerly loads js.stripe.com on import, which would hit
// the network (and violate CSP) on every checkout page even when Stripe is
// unconfigured and the wallet never activates.
import { loadStripe } from '@stripe/stripe-js/pure'
import type { Stripe, StripeElements, StripeExpressCheckoutElement } from '@stripe/stripe-js'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * In-page wallet button (Apple Pay / Google Pay / Link) via Stripe's Express
 * Checkout Element. Pays an existing pending order: on the wallet sheet's
 * `confirm` we create a PaymentIntent server-side and confirm it in the browser.
 * The order settles from the `payment_intent.succeeded` webhook — the redirect
 * to `return_url` is NOT authoritative (mirrors the PayU/Stripe redirect flows).
 *
 * Graceful by design: renders nothing when Stripe is unconfigured, and the
 * element itself shows nothing when the device/browser has no available wallet
 * (e.g. Chromium / localhost), so dev never shows a dead button. Mount inside
 * `<ClientOnly>` — Stripe.js is browser-only.
 */
const props = defineProps<{
  orderId: number
  amountMinor: number
  currency: string
  orderNumber: string
  /** Guest orders only: threaded into the PaymentIntent call + return_url. */
  guestToken?: string | null
}>()

const { t } = useI18n()
const { data: config } = useStripeConfig()
const createPaymentIntent = useCreateStripePaymentIntent()

const mountEl = ref<HTMLElement | null>(null)
const error = ref<ProblemDetails | null>(null)
const hasWallet = ref(false)

let stripe: Stripe | null = null
let elements: StripeElements | null = null
let expressEl: StripeExpressCheckoutElement | null = null

async function mountElement() {
  if (!import.meta.client || expressEl) return
  const cfg = config.value
  if (!cfg?.configured || !cfg.publishable_key || !mountEl.value) return

  stripe = await loadStripe(cfg.publishable_key)
  if (!stripe || !mountEl.value) return

  elements = stripe.elements({
    mode: 'payment',
    amount: props.amountMinor,
    currency: props.currency.toLowerCase(),
  })
  const el = elements.create('expressCheckout')
  // `ready` reports which wallets the device actually offers; gate the divider
  // on it so we never show "or pay another way" above an empty slot.
  el.on('ready', event => (hasWallet.value = Boolean(event.availablePaymentMethods)))
  el.on('confirm', onConfirm)
  el.mount(mountEl.value)
  expressEl = el
}

async function onConfirm() {
  error.value = null
  if (!stripe || !elements) return

  const { error: submitError } = await elements.submit()
  if (submitError) {
    error.value = { title: submitError.message || t('payment.walletError') }
    return
  }

  try {
    const { client_secret } = await createPaymentIntent.mutateAsync({
      orderId: props.orderId,
      guestToken: props.guestToken,
    })
    const returnUrl = new URL('/checkout/payment/return', window.location.origin)
    returnUrl.searchParams.set('order', props.orderNumber)
    // Lets the return page offer the guest a "track your order" CTA — useState
    // doesn't survive the redirect round-trip, so the token rides the URL.
    if (props.guestToken) returnUrl.searchParams.set('token', props.guestToken)

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret: client_secret,
      confirmParams: { return_url: returnUrl.toString() },
    })
    // Reached only on error — success redirects the browser to return_url.
    if (confirmError) error.value = { title: confirmError.message || t('payment.walletError') }
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}

// The mount node always exists (v-show, not v-if), so the ref is stable from
// mount: attempt once on mount (config already cached) and again whenever config
// arrives later (first prod load) — mountElement is a no-op once mounted.
onMounted(mountElement)
watch(config, mountElement)

onBeforeUnmount(() => expressEl?.unmount())
</script>

<template>
  <div v-show="config?.configured">
    <ErrorAlert
      v-if="error"
      :problem="error"
      class="mb-2"
    />
    <div ref="mountEl" />
    <div
      v-if="hasWallet"
      class="my-3 flex items-center gap-3 text-xs text-muted"
    >
      <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      {{ t('payment.methods.walletDivider') }}
      <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
    </div>
  </div>
</template>
