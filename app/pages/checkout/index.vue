<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, selectPrice } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ShippingInput } from '#shared/validators/checkout'
import type { OrderResponse } from '#shared/types/api'
import type { AppliedCoupon } from '~/components/checkout/CouponField.vue'
import { useAddressesQuery } from '~/composables/queries/useAddresses'

definePageMeta({ middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const authStore = useAuthStore()
const { currency } = useCurrencyPreference()
const createOrder = useCreateOrder()

// Saved address book (client-gated authed read). A returning customer can pick a
// saved address to prefill the shipping form; the default-shipping address is
// pre-selected. `null` means "enter a new address" (falls back to the profile
// fields). Guests / first-time buyers see an empty list → the picker hides.
const { data: savedAddresses } = useAddressesQuery()
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
const error = ref<ProblemDetails | null>(null)

// Lifted state: country comes from the form, method id comes from the selector.
// Both feed the quote endpoint; the selected method rides on the create-order
// payload. Starts empty — a picked saved address sets it (watch below).
const selectedCountry = ref<string>('')
const selectedMethodId = ref<number | null>(null)

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

// Applied discount code (lifted from CouponField). The field validates against
// the live subtotal/currency and re-validates on changes, so this discount is
// always consistent with what the backend will re-compute at order create.
const appliedCoupon = ref<AppliedCoupon | null>(null)
const discountAmount = computed(() => appliedCoupon.value?.discountAmount ?? 0)

const summaryLines = computed(() =>
  cart.items.map((item) => {
    const picked = selectPrice(item, currency.value)
    return {
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      lineTotal: picked ? formatMoney(picked.amount * item.quantity, picked.currency, locale.value) : '—',
    }
  }),
)

const subtotal = computed(() => formatMoney(subtotalAmount.value, currency.value, locale.value))
const shippingFormatted = computed(() => formatMoney(shippingAmount.value, currency.value, locale.value))
const discountFormatted = computed(() => formatMoney(discountAmount.value, currency.value, locale.value))
const total = computed(() =>
  formatMoney(
    subtotalAmount.value - discountAmount.value + shippingAmount.value,
    currency.value,
    locale.value,
  ),
)

async function placeOrder(shipping: ShippingInput) {
  // Defense-in-depth: the form isn't rendered while impersonating, and the
  // backend guard 403s the POST anyway — but never attempt the write.
  if (authStore.isImpersonating) return
  // Belt-and-braces: the form button is also disabled when this is null.
  if (selectedMethodId.value == null) return
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
      coupon_code: appliedCoupon.value?.code,
      items: cart.items.map(item => ({ product_id: item.productId, quantity: item.quantity })),
    })
    lastOrder.value = order
    cart.clear()
    await navigateTo(localePath('/checkout/success'))
  }
  catch (err) {
    error.value = parseProblem(err)
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
              :submit-disabled="selectedMethodId === null"
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
            />
          </section>

          <aside class="h-fit rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <h2 class="mb-3 font-semibold">
              {{ t('checkout.summary.heading') }}
            </h2>
            <ul class="divide-y divide-gray-100 dark:divide-gray-800">
              <li
                v-for="line in summaryLines"
                :key="line.productId"
                class="flex items-start justify-between gap-2 py-2 text-sm"
              >
                <span class="text-muted">{{ line.name }} × {{ line.quantity }}</span>
                <span class="font-medium">{{ line.lineTotal }}</span>
              </li>
            </ul>
            <div class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <CheckoutCouponField
                v-model="appliedCoupon"
                :subtotal="subtotalAmount"
                :currency="currency"
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
                <span>{{ shippingFormatted }}</span>
              </div>
              <div class="flex items-center justify-between pt-1 font-semibold">
                <span>{{ t('checkout.summary.total') }}</span>
                <span>{{ total }}</span>
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
