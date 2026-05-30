<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, selectPrice } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ShippingInput } from '#shared/validators/checkout'
import type { OrderResponse } from '#shared/types/api'

definePageMeta({ middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const cart = useCartStore()
const authStore = useAuthStore()
const { currency } = useCurrencyPreference()
const createOrder = useCreateOrder()

useHead({ title: () => t('checkout.title') })

// Survives the client navigation to /checkout/success (reset on a hard reload).
const lastOrder = useState<OrderResponse | null>('checkout:lastOrder', () => null)
const error = ref<ProblemDetails | null>(null)

// Lifted state: country comes from the form, method id comes from the selector.
// Both feed the quote endpoint; the selected method rides on the create-order
// payload. Initial country falls back to the profile so a returning customer
// gets re-quoted immediately on hard load.
const selectedCountry = ref<string>(authStore.user?.shipping_country ?? '')
const selectedMethodId = ref<number | null>(null)

const initialShipping = computed<Partial<ShippingInput>>(() => ({
  address: authStore.user?.shipping_street ?? '',
  city: authStore.user?.shipping_city ?? '',
  postalCode: authStore.user?.shipping_postal_code ?? '',
  country: authStore.user?.shipping_country ?? '',
}))

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
const total = computed(() =>
  formatMoney(subtotalAmount.value + shippingAmount.value, currency.value, locale.value),
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
            <CheckoutShippingForm
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
            <div class="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div class="flex items-center justify-between text-sm text-muted">
                <span>{{ t('checkout.summary.subtotal') }}</span>
                <span>{{ subtotal }}</span>
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
