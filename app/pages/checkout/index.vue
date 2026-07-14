<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { localizedCartVariantTitle } from '#shared/utils/localizedProduct'
import { formatMoney, selectPrice } from '#shared/utils/money'
import { tenderCoverage } from '#shared/utils/giftCard'
import { isValidNip } from '#shared/utils/nip'
import type { ShippingInput } from '#shared/validators/checkout'
import type { OrderResponse } from '#shared/types/api'
import type { AppliedCoupon } from '~/components/checkout/CouponField.vue'
import type { AppliedGiftCard } from '~/components/checkout/GiftCardField.vue'
import { useAddressesQuery } from '~/composables/queries/useAddresses'

// No `user` middleware — guest checkout is allowed. Anonymous buyers supply a
// contact email (backend `guest_email`, 422 without it); authed buyers keep the
// saved-address picker and never see the guest field.

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const authStore = useAuthStore()
const { currency } = useCurrencyPreference()
const createOrder = useCreateOrder()
const { beginCheckout, addShippingInfo } = useEcommerceTracking()

// Client-only render (see <ClientOnly> below), so this never flips mid-paint:
// the auth plugin's session restore completes before the checkout UI mounts.
const isGuest = computed(() => !authStore.isAuthenticated)

// Saved address book (client-gated authed read). A returning customer can pick a
// saved address to prefill the shipping form; the default-shipping address is
// pre-selected. `null` means "enter a new address" (falls back to the profile
// fields). First-time buyers see an empty list → the picker hides; anonymous
// guests skip the authed read entirely (no pointless 401).
const { data: savedAddresses } = useAddressesQuery(() => authStore.isAuthenticated)
const selectedAddressId = ref<number | null>(null)

// Once the address book resolves, default the picker to the default-shipping
// address (only while the customer hasn't made a choice yet).
const pickerTouched = ref(false)
watch(savedAddresses, (list) => {
  if (pickerTouched.value || !list?.length) return
  const def = list.find(a => a.is_default_shipping) ?? null
  selectedAddressId.value = def?.id ?? null
}, { immediate: true })

function onPickAddress(id: number | null) {
  pickerTouched.value = true
  selectedAddressId.value = id
}

const selectedAddress = computed(() =>
  selectedAddressId.value == null
    ? null
    : (savedAddresses.value?.find(a => a.id === selectedAddressId.value) ?? null),
)

useHead({ title: () => t('checkout.title') })

// Survives the client navigation to /checkout/success (reset on a hard reload).
const lastOrder = useState<OrderResponse | null>('checkout:lastOrder', () => null)
const error = ref<unknown>(null)

// Lifted state: country comes from the form, method id comes from the selector.
// Both feed the quote endpoint; the selected method rides on the create-order
// payload. Starts empty — a picked saved address sets it (watch below).
const selectedCountry = ref<string>('')
const selectedMethodId = ref<number | null>(null)
// The chosen method's code (from the selector) — drives the InPost picker.
const selectedMethodCode = ref<string | null>(null)
const isInpostLocker = computed(() => (selectedMethodCode.value ?? '').toLowerCase().startsWith('inpost'))
const inpostPoint = ref<{ id: string, name: string } | null>(null)
// An InPost-locker method requires a picked Paczkomat (mirrors the backend 422).
const inpostBlocksSubmit = computed(() => isInpostLocker.value && inpostPoint.value === null)

// B2C faktura request ("Chcę fakturę / na firmę"): a consumer buying for their
// business supplies a company name + NIP printed on the invoice. The NIP is
// checksum-validated client-side (the backend re-validates + 422s).
const wantsInvoice = ref(false)
const invoiceNip = ref('')
const invoiceName = ref('')
const nipInvalid = computed(
  () => wantsInvoice.value && invoiceNip.value.trim().length > 0 && !isValidNip(invoiceNip.value),
)
const invoiceBlocksSubmit = computed(
  () => wantsInvoice.value && (nipInvalid.value || invoiceNip.value.trim().length === 0),
)

// Payment choice made at checkout: 'online' (pay on the success page via
// PayU/Stripe) or 'cod' (cash on delivery / pobranie — no online capture, the
// order stays PENDING and is paid to the courier). Only 'cod' rides the
// create payload; online methods are picked after create on the success page.
const payOnDelivery = ref(false)

// Prefill source: a chosen saved address populates the form; otherwise the
// fields start empty. The saved-address picker is the prefill mechanism now —
// the old inline profile shipping snapshot (users.shipping_*) was dropped.
const initialShipping = computed<Partial<ShippingInput>>(() => {
  const picked = selectedAddress.value
  if (picked) {
    return {
      address: picked.street,
      city: picked.city,
      postalCode: picked.postal_code,
      country: picked.country,
    }
  }
  return { address: '', city: '', postalCode: '', country: '' }
})

// Remount the shipping form whenever the prefill source switches so the picked
// address fully repopulates the fields (the form only backfills empties on its
// own `initial` watch — keying forces a clean re-seed).
const shippingFormKey = computed(() => `addr-${selectedAddressId.value ?? 'new'}`)

// Keep the lifted country in sync when a saved address is picked so shipping
// re-quotes for the new country without waiting for the form's own emit.
watch(selectedAddress, (addr) => {
  if (addr) selectedCountry.value = addr.country
})

const subtotalAmount = computed(() =>
  cart.items.reduce((sum, item) => {
    const picked = selectPrice(item, currency.value)
    return sum + (picked ? picked.amount * item.quantity : 0)
  }, 0),
)

// Cart total weight: NULL/missing weights contribute 0 — matches the backend's
// `(product.weight_kg or 0) * quantity` sum at order create. Threaded into the
// selector so a weight-tiered rate quotes the same amount the order will charge.
const cartWeightKg = computed(() =>
  cart.items.reduce((sum, item) => sum + (item.weightKg ?? 0) * item.quantity, 0),
)

// Cart total volume in cm³ — pre-sum of per-line `l × w × h × qty` (any line
// missing one of the three dimensions contributes 0, matching the backend's
// `line_volume_cm3`). The backend's quote endpoint reads this scalar +
// the resolved zone's `dim_divisor` to compute volumetric weight; the
// frontend never sees the divisor. Models "one consolidated shipment" per
// the dimensional-weight handoff's volume-aggregation choice (a).
const cartVolumeCm3 = computed(() =>
  cart.items.reduce(
    (sum, item) =>
      sum + (item.lengthCm ?? 0) * (item.widthCm ?? 0) * (item.heightCm ?? 0) * item.quantity,
    0,
  ),
)

// Mirror of the selector's chosen shipping amount (its second emit) so the
// summary aside can show "Shipping: X · Total: subtotal + X" without the page
// having to own a second `useShippingQuote` call.
const shippingAmount = ref(0)

// Applied discount (lifted from CouponField) — a typed code or an automatic
// discount previewed without typing. The field validates against the live
// subtotal/shipping/currency and re-validates on changes, so this discount is
// always consistent with what the backend will re-compute at order create.
// A free_shipping winner zeroes the shipping instead of discounting goods
// (mirrors the server: order.shipping = 0, order.discount = 0).
const appliedCoupon = ref<AppliedCoupon | null>(null)
const isFreeShipping = computed(() => appliedCoupon.value?.freeShipping ?? false)
const discountAmount = computed(() =>
  isFreeShipping.value ? 0 : (appliedCoupon.value?.discountAmount ?? 0),
)
const effectiveShippingAmount = computed(() =>
  isFreeShipping.value ? 0 : shippingAmount.value,
)

const summaryLines = computed(() =>
  cart.items.map((item) => {
    const picked = selectPrice(item, currency.value)
    return {
      // Line identity is the (productId, variantId) pair (variants F2).
      key: `${item.productId}:${item.variantId ?? ''}`,
      name: item.name,
      variantTitle: localizedCartVariantTitle(item, locale.value),
      quantity: item.quantity,
      lineTotal: picked ? formatMoney(picked.amount * item.quantity, picked.currency, locale.value) : '—',
    }
  }),
)

const subtotal = computed(() => formatMoney(subtotalAmount.value, currency.value, locale.value))
const shippingFormatted = computed(() => formatMoney(shippingAmount.value, currency.value, locale.value))
const freeShippingFormatted = computed(() => formatMoney(0, currency.value, locale.value))
const discountFormatted = computed(() => formatMoney(discountAmount.value, currency.value, locale.value))
const orderTotalAmount = computed(() =>
  subtotalAmount.value - discountAmount.value + effectiveShippingAmount.value,
)
const total = computed(() => formatMoney(orderTotalAmount.value, currency.value, locale.value))

// Stored-value tenders (D2/D10): applied AFTER the coupon, against the order
// total — gift card first (min(balance, total)), then store credit
// (min(balance, remainder)). Both are previewed client-side here; the backend
// re-computes and debits authoritatively at order create, so `amount_due` on
// the created order (not this preview) is what a provider is charged.
const appliedGiftCard = ref<AppliedGiftCard | null>(null)
const useStoreCredit = ref(false)
const storeCreditApplied = ref(0)

const giftCardCoverage = computed(() =>
  appliedGiftCard.value
    ? tenderCoverage(appliedGiftCard.value.balance, orderTotalAmount.value)
    : 0,
)
const remainingAfterGiftCard = computed(() => orderTotalAmount.value - giftCardCoverage.value)
const amountDueAmount = computed(() =>
  Math.max(0, orderTotalAmount.value - giftCardCoverage.value - storeCreditApplied.value),
)
const hasTenders = computed(() => giftCardCoverage.value > 0 || storeCreditApplied.value > 0)

const giftCardFormatted = computed(() =>
  formatMoney(giftCardCoverage.value, currency.value, locale.value),
)
const storeCreditFormatted = computed(() =>
  formatMoney(storeCreditApplied.value, currency.value, locale.value),
)
const amountDueFormatted = computed(() =>
  formatMoney(amountDueAmount.value, currency.value, locale.value),
)

// GA4 begin_checkout once on mount (the composable guards SSR/consent). The
// coupon may not be applied yet — that's fine, GA4 stitches the funnel by
// session; the value reflects the current cart.
onMounted(() => {
  if (!cart.isEmpty) beginCheckout(cart.items, appliedCoupon.value?.code)
})

// GA4 add_shipping_info when a shipping method is first resolved (the selector
// emits the chosen id). `shipping_tier` is the human method name when known.
watch(selectedMethodId, (id, prev) => {
  if (id != null && id !== prev && !cart.isEmpty) {
    addShippingInfo(cart.items, undefined, appliedCoupon.value?.code)
  }
})

async function placeOrder(shipping: ShippingInput) {
  // Defense-in-depth: the form isn't rendered while impersonating, and the
  // backend guard 403s the POST anyway — but never attempt the write.
  if (authStore.isImpersonating) return
  // Belt-and-braces: the form button is also disabled when this is null.
  if (selectedMethodId.value == null) return
  // A faktura request must carry a valid NIP (the button is also disabled).
  if (invoiceBlocksSubmit.value) return
  // An InPost-locker method must have a picked Paczkomat.
  if (inpostBlocksSubmit.value) return
  error.value = null
  try {
    const order = await createOrder.mutateAsync({
      shipping_address: shipping.address,
      shipping_city: shipping.city,
      shipping_postal_code: shipping.postalCode,
      shipping_country: shipping.country,
      shipping_method_id: selectedMethodId.value,
      notes: shipping.notes?.trim() || undefined,
      currency: currency.value,
      // Cash-on-delivery is the only payment method chosen at create; online
      // methods are picked after create on the success page.
      ...(payOnDelivery.value ? { payment_method: 'cod' as const } : {}),
      // InPost locker: send the picked Paczkomat point (the backend 422s a
      // locker method without one).
      ...(isInpostLocker.value && inpostPoint.value
        ? {
            inpost_point_id: inpostPoint.value.id,
            inpost_point_name: inpostPoint.value.name,
          }
        : {}),
      // B2C faktura: send the NIP + (optional) buyer name when requested.
      ...(wantsInvoice.value && invoiceNip.value.trim()
        ? {
            invoice_nip: invoiceNip.value.trim(),
            invoice_name: invoiceName.value.trim() || undefined,
          }
        : {}),
      // Manual codes only: an automatic discount is re-picked server-side at
      // order create — sending its code would turn it into a manual code (and
      // 400 the checkout if it expired between preview and create).
      coupon_code: appliedCoupon.value && !appliedCoupon.value.isAutomatic
        ? appliedCoupon.value.code
        : undefined,
      // Stored-value tenders (D2/D10). The gift-card code is sent verbatim (the
      // backend re-validates + debits, failing loud on a depleted card);
      // `use_store_credit` is opportunistic — the backend spends min(balance,
      // remainder) and contributes 0 when there's nothing to spend.
      ...(appliedGiftCard.value ? { gift_card_code: appliedGiftCard.value.code } : {}),
      use_store_credit: useStoreCredit.value,
      // Anonymous only: contact email + UI locale (order emails + invoice
      // language). An authed request must NOT send guest_email (backend 422s).
      ...(isGuest.value
        ? { guest_email: shipping.email, locale: locale.value as 'en' | 'pl' }
        : {}),
      items: cart.items.map(item => ({
        product_id: item.productId,
        variant_id: item.variantId ?? undefined,
        quantity: item.quantity,
      })),
    })
    lastOrder.value = order
    cart.clear()
    await navigateTo(localePath('/checkout/success'))
  }
  catch (err) {
    error.value = err
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 class="mb-6 text-2xl font-bold">
        {{ t('checkout.title') }}
      </h1>

      <!-- The cart is client-only state; render checkout client-side. -->
      <ClientOnly>
        <div
          v-if="cart.isEmpty"
          class="flex flex-col items-center gap-4 py-16 text-center"
        >
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
          v-else-if="authStore.isImpersonating"
          class="flex flex-col items-center gap-3 py-16 text-center"
        >
          <UIcon
            name="i-lucide-eye"
            class="text-3xl text-muted"
          />
          <p class="text-muted">
            {{ t('impersonation.checkoutBlocked') }}
          </p>
        </div>

        <div
          v-else
          class="grid gap-8 lg:grid-cols-2"
        >
          <section class="space-y-4">
            <h2 class="mb-4 text-lg font-semibold">
              {{ t('checkout.shipping.heading') }}
            </h2>
            <AccountAddressesAddressPicker
              v-if="(savedAddresses?.length ?? 0) > 0"
              :addresses="savedAddresses ?? []"
              :model-value="selectedAddressId"
              @update:model-value="onPickAddress"
            />
            <CheckoutShippingForm
              :key="shippingFormKey"
              :initial="initialShipping"
              :loading="createOrder.isLoading.value"
              :error="error"
              :submit-disabled="selectedMethodId === null || invoiceBlocksSubmit || inpostBlocksSubmit"
              :guest="isGuest"
              @submit="placeOrder"
              @update:country="selectedCountry = $event"
            />
            <CheckoutShippingMethodSelector
              v-model="selectedMethodId"
              :country="selectedCountry"
              :currency="currency"
              :subtotal="subtotalAmount"
              :weight-kg="cartWeightKg"
              :cart-volume-cm3="cartVolumeCm3"
              @update:method-amount="shippingAmount = $event"
              @update:method-code="(c) => { selectedMethodCode = c; inpostPoint = null }"
            />

            <!-- InPost Paczkomat picker — only for an InPost-locker method. -->
            <ClientOnly v-if="isInpostLocker">
              <CheckoutInpostPointPicker @select="inpostPoint = $event" />
            </ClientOnly>

            <!-- B2C faktura request (na firmę). Optional; when checked, a valid
                 NIP is required (button stays disabled until it validates). -->
            <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <UCheckbox
                v-model="wantsInvoice"
                :label="t('checkout.faktura.toggle')"
              />
              <div
                v-if="wantsInvoice"
                class="mt-3 space-y-3"
              >
                <UFormField
                  :label="t('checkout.faktura.nipLabel')"
                  :error="nipInvalid ? t('checkout.faktura.nipInvalid') : undefined"
                >
                  <UInput
                    v-model="invoiceNip"
                    :placeholder="t('checkout.faktura.nipPlaceholder')"
                    class="w-full"
                    inputmode="numeric"
                  />
                </UFormField>
                <UFormField :label="t('checkout.faktura.nameLabel')">
                  <UInput
                    v-model="invoiceName"
                    :placeholder="t('checkout.faktura.namePlaceholder')"
                    class="w-full"
                  />
                </UFormField>
                <p class="text-xs text-muted">
                  {{ t('checkout.faktura.hint') }}
                </p>
              </div>
            </div>

            <!-- Payment choice: online (default, paid on the success page) vs
                 cash-on-delivery / pobranie. -->
            <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <UCheckbox
                v-model="payOnDelivery"
                :label="t('checkout.cod.toggle')"
              />
              <p class="mt-1 text-xs text-muted">
                {{ payOnDelivery ? t('checkout.cod.hint') : t('checkout.cod.onlineHint') }}
              </p>
            </div>
          </section>

          <aside class="h-fit rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <h2 class="mb-3 font-semibold">
              {{ t('checkout.summary.heading') }}
            </h2>
            <ul class="divide-y divide-gray-100 dark:divide-gray-800">
              <li
                v-for="line in summaryLines"
                :key="line.key"
                class="flex items-start justify-between gap-2 py-2 text-sm"
              >
                <span class="text-muted">
                  {{ line.name }} × {{ line.quantity }}
                  <span
                    v-if="line.variantTitle"
                    class="block text-xs"
                    data-testid="summary-variant-title"
                  >{{ line.variantTitle }}</span>
                </span>
                <span class="font-medium">{{ line.lineTotal }}</span>
              </li>
            </ul>
            <div class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <CheckoutCouponField
                v-model="appliedCoupon"
                :subtotal="subtotalAmount"
                :shipping-amount="shippingAmount"
                :currency="currency"
              />
            </div>
            <!-- Stored-value tenders (D2): each self-gates on its public toggle
                 (+ auth/balance for store credit) and renders nothing when off. -->
            <div class="mt-3 space-y-3">
              <CheckoutGiftCardField
                v-model="appliedGiftCard"
                :currency="currency"
                :order-total="orderTotalAmount"
              />
              <CheckoutStoreCreditField
                v-model="useStoreCredit"
                :currency="currency"
                :remaining="remainingAfterGiftCard"
                @update:applied="storeCreditApplied = $event"
              />
            </div>
            <div class="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div class="flex items-center justify-between text-sm text-muted">
                <span>{{ t('checkout.summary.subtotal') }}</span>
                <span>{{ subtotal }}</span>
              </div>
              <div
                v-if="discountAmount > 0"
                class="flex items-center justify-between text-sm text-primary"
                data-testid="summary-discount"
              >
                <span>
                  {{ t('checkout.summary.discount') }}
                  <span
                    v-if="appliedCoupon"
                    class="text-muted"
                  >({{ appliedCoupon.code }})</span>
                </span>
                <span>−{{ discountFormatted }}</span>
              </div>
              <div class="flex items-center justify-between text-sm text-muted">
                <span>{{ t('checkout.summary.shipping') }}</span>
                <!-- free_shipping coupon: original amount struck through to 0 -->
                <span
                  v-if="isFreeShipping"
                  data-testid="summary-shipping-free"
                >
                  <span class="line-through">{{ shippingFormatted }}</span>
                  <span class="ml-1 font-medium text-primary">{{ freeShippingFormatted }}</span>
                </span>
                <span v-else>{{ shippingFormatted }}</span>
              </div>
              <div
                :class="[
                  'flex items-center justify-between pt-1',
                  hasTenders ? 'text-sm text-muted' : 'font-semibold',
                ]"
              >
                <span>{{ t('checkout.summary.total') }}</span>
                <span data-testid="summary-total">{{ total }}</span>
              </div>
              <!-- Stored-value tender deductions + amount actually due -->
              <div
                v-if="giftCardCoverage > 0"
                class="flex items-center justify-between text-sm text-primary"
                data-testid="summary-gift-card"
              >
                <span>{{ t('checkout.summary.giftCard') }}</span>
                <span>−{{ giftCardFormatted }}</span>
              </div>
              <div
                v-if="storeCreditApplied > 0"
                class="flex items-center justify-between text-sm text-primary"
                data-testid="summary-store-credit"
              >
                <span>{{ t('checkout.summary.storeCredit') }}</span>
                <span>−{{ storeCreditFormatted }}</span>
              </div>
              <div
                v-if="hasTenders"
                class="flex items-center justify-between border-t border-gray-100 pt-1 font-semibold dark:border-gray-800"
                data-testid="summary-amount-due"
              >
                <span>{{ t('checkout.summary.amountDue') }}</span>
                <span data-testid="summary-amount-due-value">{{ amountDueFormatted }}</span>
              </div>
            </div>
            <ULink
              :to="localePath('/cart')"
              class="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {{ t('checkout.editCart') }}
            </ULink>
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
