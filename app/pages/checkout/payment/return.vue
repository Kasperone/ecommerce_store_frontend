<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildApiUrl } from '#shared/constants/api'
import type { GuestOrderResponse, OrderResponse } from '#shared/types/api'

/**
 * PayU's `continueUrl` lands the buyer here after they finish (or abandon) the
 * hosted payment page, with `?order=<order_number>`. The redirect is NOT
 * authoritative — PayU settles the order server-to-server via the signed
 * webhook, which may arrive slightly before or after this page loads. So we
 * show a "confirming your payment" notice and point the buyer at their orders,
 * where the settled status appears once the webhook lands.
 *
 * No `user` middleware — guest orders return here too (PayU continueUrl /
 * Stripe success_url / the wallet's client-built return_url). The wallet flow
 * appends `&token=<guest_token>` so a guest gets a "track your order" CTA; the
 * hosted redirect flows carry only `?order=` — those guests fall back to the
 * tracking link in the order-confirmation email.
 */

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const authStore = useAuthStore()
const { apiFetch } = useApi()
const { trackPurchaseOnce, trackPurchaseOnceMinimal } = useEcommerceTracking()

const orderNumber = computed(() => {
  const o = route.query.order
  return typeof o === 'string' ? o : undefined
})

// Guest tracking token (wallet-flow return_url only). Token-shaped query noise
// is harmless — the track page 404s on an unknown token.
const guestToken = computed(() => {
  const tok = route.query.token
  return typeof tok === 'string' && tok.length > 0 ? tok : undefined
})

// The in-page checkout may have stashed the full order before navigating here
// (wallet flow). On a true hosted redirect this is null and we fall back below.
const lastOrder = useState<OrderResponse | null>('checkout:lastOrder', () => null)

// GA4 + Ads purchase, deduped once per order_number across this page and
// success.vue. Preference order: the full in-memory order → a guest-token
// lookup (minimal, no item ids in the trimmed view) → nothing (the success
// page or a prior visit already tracked it; the dedup key also protects us).
onMounted(async () => {
  const num = orderNumber.value
  if (!num) return
  if (lastOrder.value && lastOrder.value.order_number === num) {
    trackPurchaseOnce(lastOrder.value)
    return
  }
  if (guestToken.value) {
    try {
      const guest = await apiFetch<GuestOrderResponse>(buildApiUrl.orderTrack(guestToken.value))
      if (guest.order_number === num) {
        trackPurchaseOnceMinimal({
          order_number: guest.order_number,
          total: guest.total,
          currency: guest.currency,
          shipping: guest.shipping,
        })
      }
    }
    catch {
      // Best-effort — the order still settles via the webhook regardless of
      // whether the conversion pixel fired here.
    }
  }
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
          v-if="guestToken"
          color="primary"
          :to="localePath(`/orders/track/${guestToken}`)"
          data-testid="track-order-cta"
        >
          {{ t('payment.return.trackOrder') }}
        </UButton>
        <UButton
          v-else-if="authStore.isAuthenticated"
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
