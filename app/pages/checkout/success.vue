<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import type { OrderResponse } from '#shared/types/api'

// No `user` middleware — guests land here after checkout too. The order state
// below is the only data source; a hard reload clears it for everyone alike.

const { t, locale } = useI18n()
const localePath = useLocalePath()

// Set by the checkout page before navigating here; null on a hard reload.
const order = useState<OrderResponse | null>('checkout:lastOrder', () => null)

// GA4 + Ads purchase — fired exactly once per order_number across this page and
// the hosted-redirect return page (dedup keyed in localStorage). On a hard
// reload `order` is null → nothing fires (and the buyer already had it tracked).
const { trackPurchaseOnce } = useEcommerceTracking()
onMounted(() => {
  trackPurchaseOnce(order.value)
})

// Guest orders (user_id = null) carry a tracking token: the "view order" CTA
// targets the public track page — guests have no /account/orders.
const viewOrderTo = computed(() => {
  if (!order.value) return null
  return order.value.guest_token
    ? localePath(`/orders/track/${order.value.guest_token}`)
    : localePath(`/account/orders/${order.value.id}`)
})

useHead({ title: () => t('checkout.success.title') })

function money(value: number) {
  return order.value
    ? formatMoney(value, order.value.currency as CurrencyCode, locale.value)
    : ''
}

const total = computed(() => (order.value ? money(order.value.total) : null))

// Stored-value tenders (D2) — the created order carries the authoritative
// figures. When `amount_due === 0` the backend already flipped the order to PAID
// at creation (gift card / store credit fully covered it), so there is nothing
// to collect online: the provider picker is skipped entirely (D10).
const hasTenders = computed(
  () =>
    order.value != null
    && ((order.value.gift_card_amount ?? 0) > 0 || (order.value.store_credit_amount ?? 0) > 0),
)
const isPaidInFull = computed(() => order.value != null && order.value.amount_due === 0)

// Gift cards v2: an order with gift-card lines issues one card per unit when
// paid, emailed to the recipient (or the buyer when the recipient was left
// blank). Surface that here. Distinct recipients; a blank recipient collapses
// into a single "emailed to you" line.
const giftCardLines = computed(() => (order.value?.items ?? []).filter(i => i.is_gift_card))
const hasGiftCards = computed(() => giftCardLines.value.length > 0)
const giftCardRecipients = computed(() => {
  const emails = new Set<string>()
  let toBuyer = false
  for (const line of giftCardLines.value) {
    const email = line.gift_card_recipient_email?.trim()
    if (email) emails.add(email)
    else toBuyer = true
  }
  return { emails: [...emails], toBuyer }
})
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <ClientOnly>
        <UIcon
          name="i-lucide-circle-check"
          class="mx-auto mb-4 size-14 text-success"
        />
        <h1 class="text-2xl font-bold">
          {{ t('checkout.success.title') }}
        </h1>
        <p class="mt-2 text-muted">
          {{ t('checkout.success.message') }}
        </p>

        <div
          v-if="order"
          :class="[
            'mx-auto mt-6 max-w-sm rounded-lg border border-gray-200 p-4 text-left',
            'dark:border-gray-800',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-muted">{{ t('checkout.success.orderNumber') }}</span>
            <strong class="font-mono">{{ order.order_number }}</strong>
          </div>
          <div
            :class="[
              'mt-2 flex items-center justify-between',
              hasTenders ? 'text-sm text-muted' : '',
            ]"
          >
            <span class="text-muted">{{ t('checkout.summary.total') }}</span>
            <span class="font-medium">{{ total }}</span>
          </div>
          <template v-if="hasTenders && order">
            <div
              v-if="(order.gift_card_amount ?? 0) > 0"
              class="mt-1 flex items-center justify-between text-sm text-primary"
              data-testid="success-gift-card"
            >
              <span>
                {{ t('checkout.summary.giftCard') }}
                <span
                  v-if="order.gift_card_last4"
                  class="text-muted"
                >(•••• {{ order.gift_card_last4 }})</span>
              </span>
              <span>−{{ money(order.gift_card_amount) }}</span>
            </div>
            <div
              v-if="(order.store_credit_amount ?? 0) > 0"
              class="mt-1 flex items-center justify-between text-sm text-primary"
              data-testid="success-store-credit"
            >
              <span>{{ t('checkout.summary.storeCredit') }}</span>
              <span>−{{ money(order.store_credit_amount) }}</span>
            </div>
            <div
              class="mt-1 flex items-center justify-between border-t border-gray-100 pt-2 font-medium dark:border-gray-800"
              data-testid="success-amount-due"
            >
              <span>{{ t('checkout.summary.amountDue') }}</span>
              <span>{{ money(order.amount_due) }}</span>
            </div>
          </template>
        </div>

        <!-- Gift cards v2: the purchased card(s) are emailed on payment. -->
        <div
          v-if="order && hasGiftCards"
          class="mx-auto mt-6 max-w-sm rounded-lg border border-primary/30 bg-primary/5 p-4 text-left text-sm"
          data-testid="gift-card-emailed"
        >
          <p class="flex items-center gap-2 font-medium text-primary">
            <UIcon
              name="i-lucide-gift"
              class="size-4"
            />
            {{ t('checkout.success.giftCardTitle') }}
          </p>
          <ul class="mt-2 space-y-1 text-muted">
            <li
              v-for="email in giftCardRecipients.emails"
              :key="email"
            >
              {{ t('checkout.success.giftCardEmailed', { email }) }}
            </li>
            <li v-if="giftCardRecipients.toBuyer">
              {{ t('checkout.success.giftCardEmailedToYou') }}
            </li>
          </ul>
        </div>

        <!-- Fully covered by gift card / store credit (amount_due === 0): the
             order is already PAID at creation — no provider step. -->
        <div
          v-if="order && isPaidInFull"
          class="mx-auto mt-6 max-w-sm rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800"
          data-testid="paid-in-full"
        >
          <p class="font-medium">
            {{ t('payment.paidInFull.title') }}
          </p>
          <p class="mt-1 text-muted">
            {{ t('payment.paidInFull.message') }}
          </p>
        </div>
        <!-- Cash-on-delivery: nothing to pay online — confirm pobranie. -->
        <div
          v-else-if="order && order.payment_method === 'cod'"
          class="mx-auto mt-6 max-w-sm rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800"
        >
          <p class="font-medium">
            {{ t('payment.cod.title') }}
          </p>
          <p class="mt-1 text-muted">
            {{ t('payment.cod.message') }}
          </p>
        </div>
        <!-- Otherwise pay the amount still due (post-tender) via a provider. -->
        <div
          v-else-if="order"
          class="mx-auto mt-6 max-w-sm"
        >
          <p class="mb-2 text-sm text-muted">
            {{ t('payment.completePrompt') }}
          </p>
          <CheckoutPaymentMethods
            :order-id="order.id"
            :amount-minor="Math.round(order.amount_due * 100)"
            :currency="order.currency"
            :order-number="order.order_number"
            :guest-token="order.guest_token"
          />
        </div>

        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <UButton
            v-if="viewOrderTo"
            color="neutral"
            variant="soft"
            :to="viewOrderTo"
            data-testid="view-order-cta"
          >
            {{ t('orders.viewOrder') }}
          </UButton>
          <UButton
            :color="order ? 'neutral' : 'primary'"
            :variant="order ? 'soft' : 'solid'"
            :to="localePath('/products')"
          >
            {{ t('cart.actions.continueShopping') }}
          </UButton>
        </div>

        <template #fallback>
          <div class="py-8 text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
