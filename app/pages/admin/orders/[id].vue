<script setup lang="ts">
import type { OrderStatus, OrderUpdate, RefundCreate } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import { isCancellable, isRefundable, nextStatuses, statusColor } from '#shared/utils/orderStatus'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const orderId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: order, error: loadError, isLoading } = useOrderQuery(orderId)

const updateMutation = useUpdateOrder()
const cancelMutation = useCancelOrder()
const refundMutation = useIssueRefund()

// Edit fields, seeded from the loaded order.
const statusModel = ref<OrderStatus | undefined>()
const notesModel = ref('')
const paymentModel = ref('')
const formError = ref<ProblemDetails | null>(null)
const cancelOpen = ref(false)
const cancelError = ref<ProblemDetails | null>(null)
const refundOpen = ref(false)
// Raw caught error — OrderRefundDialog drives the gold-standard flow internally.
const refundError = ref<unknown>(null)

// D3: which statuses can be refunded. Mirrors the backend's REFUNDABLE_STATUSES
// set — the API re-validates, this is purely for UX (the button is hidden when
// `isRefundable` mirrors the backend `REFUNDABLE_STATUSES` set in
// `app/crud/refund.py`. v2 added `partially_refunded` to it because another
// refund may bring the cumulative total to `order.total` → REFUNDED.
const canRefund = computed(
  () => order.value != null && isRefundable(order.value.status),
)

watch(order, (o) => {
  if (!o) return
  statusModel.value = o.status
  notesModel.value = o.notes ?? ''
  paymentModel.value = o.payment_method ?? ''
}, { immediate: true })

// Forward-transition targets plus the current status (so the dropdown can
// "stay put" while editing notes/payment only).
const statusOptions = computed(() => {
  const current = order.value?.status
  if (!current) return []
  return [current, ...nextStatuses(current)].map(s => ({
    label: t(`admin.orders.status.${s}`),
    value: s,
  }))
})

const canCancel = computed(() => order.value != null && isCancellable(order.value.status))

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
}

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

async function onSave() {
  if (!order.value) return
  formError.value = null
  const patch: OrderUpdate = {
    status: statusModel.value,
    notes: notesModel.value.trim() || null,
    payment_method: paymentModel.value.trim() || null,
  }
  try {
    await updateMutation.mutateAsync({ id: order.value.id, patch })
    toast.add({
      title: t('admin.orders.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

async function onCancelConfirm() {
  if (!order.value) return
  cancelError.value = null
  try {
    await cancelMutation.mutateAsync(order.value.id)
    cancelOpen.value = false
    toast.add({
      title: t('admin.orders.flashes.cancelled'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    cancelError.value = parseProblem(err)
  }
}

async function onRefundSubmit(payload: RefundCreate) {
  if (!order.value) return
  refundError.value = null
  try {
    await refundMutation.mutateAsync({ orderId: order.value.id, refund: payload })
    refundOpen.value = false
    toast.add({
      title: t('admin.orders.flashes.refundIssued'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    refundError.value = err
  }
}

useHead({ title: () => t('admin.orders.detail.title', { number: order.value?.order_number ?? '' }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo('/admin/orders')"
      >
        {{ $t('admin.orders.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.orders.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="order">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold font-mono">
              {{ order.order_number }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ formatDate(order.created_at) }}
            </p>
          </div>
          <UBadge
            :color="statusColor(order.status)"
            variant="subtle"
            size="lg"
          >
            {{ $t(`admin.orders.status.${order.status}`) }}
          </UBadge>
        </header>

        <div class="grid gap-6 md:grid-cols-2">
          <!-- Customer -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ $t('admin.orders.detail.customer') }}
              </h2>
            </template>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.orders.detail.email') }}
                </dt>
                <dd>{{ order.user.email }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.orders.detail.name') }}
                </dt>
                <dd>{{ order.user.first_name }} {{ order.user.last_name }}</dd>
              </div>
            </dl>
          </UCard>

          <!-- Shipping -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ $t('admin.orders.detail.shipping') }}
              </h2>
            </template>
            <address class="not-italic text-sm space-y-0.5">
              <div>{{ order.shipping_address }}</div>
              <div>{{ order.shipping_postal_code }} {{ order.shipping_city }}</div>
              <div>{{ order.shipping_country }}</div>
            </address>
          </UCard>
        </div>

        <!-- Items -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.orders.detail.items') }}
            </h2>
          </template>
          <div class="divide-y divide-default">
            <div
              v-for="item in order.items"
              :key="item.id"
              class="flex items-center justify-between gap-4 py-2 text-sm"
            >
              <div>
                <div class="font-medium">
                  {{ item.product_name }}
                </div>
                <div
                  v-if="item.product_sku"
                  class="text-xs text-muted font-mono"
                >
                  {{ item.product_sku }}
                </div>
              </div>
              <div class="text-right whitespace-nowrap">
                <div>
                  {{ item.quantity }} &times; {{ formatMoney(item.unit_price, order.currency) }}
                </div>
                <div class="text-muted">
                  {{ formatMoney(item.total_price, order.currency) }}
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <dl class="space-y-1 text-sm ml-auto w-full max-w-xs">
              <div class="flex justify-between">
                <dt class="text-muted">
                  {{ $t('admin.orders.detail.subtotal') }}
                </dt>
                <dd>{{ formatMoney(order.subtotal, order.currency) }}</dd>
              </div>
              <div
                v-if="order.discount > 0"
                class="flex justify-between text-primary"
                data-testid="admin-order-discount"
              >
                <dt>
                  {{ $t('admin.orders.detail.discount') }}
                  <span
                    v-if="order.coupon_code"
                    class="text-muted"
                  >({{ order.coupon_code }})</span>
                </dt>
                <dd>−{{ formatMoney(order.discount, order.currency) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted">
                  {{ $t('admin.orders.detail.tax') }}
                </dt>
                <dd>{{ formatMoney(order.tax, order.currency) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted">
                  {{ $t('admin.orders.detail.shippingCost') }}
                </dt>
                <dd>{{ formatMoney(order.shipping, order.currency) }}</dd>
              </div>
              <div class="flex justify-between font-semibold border-t border-default pt-1">
                <dt>{{ $t('admin.orders.detail.total') }}</dt>
                <dd>{{ formatMoney(order.total, order.currency) }}</dd>
              </div>
            </dl>
          </template>
        </UCard>

        <!-- Manage -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.orders.detail.manage') }}
            </h2>
          </template>

          <ErrorAlert
            v-if="formError"
            :problem="formError"
            class="mb-4"
          />

          <div class="space-y-4">
            <UFormField :label="$t('admin.orders.detail.changeStatus')">
              <USelect
                v-model="statusModel"
                :items="statusOptions"
                value-key="value"
                class="w-60"
              />
            </UFormField>

            <UFormField :label="$t('admin.orders.detail.paymentMethod')">
              <UInput
                v-model="paymentModel"
                :placeholder="$t('admin.orders.detail.paymentPlaceholder')"
                class="w-60"
              />
            </UFormField>

            <UFormField :label="$t('admin.orders.detail.internalNotes')">
              <UTextarea
                v-model="notesModel"
                :rows="3"
                class="w-full"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2 flex-wrap">
                <UButton
                  v-if="canCancel"
                  color="error"
                  variant="soft"
                  icon="i-lucide-x-circle"
                  @click="cancelError = null; cancelOpen = true"
                >
                  {{ $t('admin.orders.actions.cancel') }}
                </UButton>
                <UButton
                  v-if="canRefund"
                  color="error"
                  variant="soft"
                  icon="i-lucide-undo-2"
                  @click="refundError = null; refundOpen = true"
                >
                  {{ $t('admin.orders.refund.button') }}
                </UButton>
              </div>
              <div class="flex items-center gap-2">
                <OrdersInvoiceDownloadButton
                  :order-id="order.id"
                  :order-number="order.order_number"
                />
                <UButton
                  color="primary"
                  icon="i-lucide-save"
                  :loading="updateMutation.isLoading.value"
                  @click="onSave"
                >
                  {{ $t('admin.orders.actions.save') }}
                </UButton>
              </div>
            </div>
          </template>
        </UCard>

        <AdminOrderRefundsSection
          :refunds="order.refunds ?? []"
          :currency="order.currency"
        />
      </template>

      <UModal
        :open="cancelOpen"
        :title="$t('admin.orders.cancel.title')"
        :description="$t('admin.orders.cancel.body')"
        :dismissible="!cancelMutation.isLoading.value"
        @update:open="(v) => { cancelOpen = v; if (!v) cancelError = null }"
      >
        <template #body>
          <ErrorAlert
            v-if="cancelError"
            :problem="cancelError"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="cancelMutation.isLoading.value"
              @click="cancelOpen = false"
            >
              {{ $t('admin.orders.cancel.dismiss') }}
            </UButton>
            <UButton
              color="error"
              :loading="cancelMutation.isLoading.value"
              @click="onCancelConfirm"
            >
              {{ $t('admin.orders.cancel.confirm') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <AdminOrderRefundDialog
        v-if="order"
        :order="order"
        :open="refundOpen"
        :loading="refundMutation.isLoading.value"
        :error="refundError"
        @update:open="(v) => { refundOpen = v; if (!v) refundError = null }"
        @submit="onRefundSubmit"
      />
    </div>
  </NuxtLayout>
</template>
