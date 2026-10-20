<script setup lang="ts">
import type { DraftOrderUpdate } from '~/composables/queries/useDraftOrderQueries'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import { parseProblem } from '#shared/utils/problemDetails'
import { draftConvertReason, draftOrderStatusColor } from '#shared/utils/draftOrderStatus'
import { countryOptions, type SupportedLocale } from '#shared/utils/countries'
import { localizedShippingMethodName } from '#shared/utils/localizedShipping'
import { normalizeApiError } from '~/utils/apiError'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const route = useRoute()
const draftId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: draft, error: loadError, isLoading } = useDraftOrderQuery(draftId)

const updateMutation = useUpdateDraftOrder()
const deleteMutation = useDeleteDraftOrder()
const convertMutation = useConvertDraftOrder()

const isCompleted = computed(() => draft.value?.status === 'completed')

// Header-edit fields, seeded from the loaded draft. The `type="number"`
// inputs emit numbers once the field holds one, so those models are
// string | number.
const customerIdModel = ref<string | number>('')
const guestEmailModel = ref('')
const addressModel = ref('')
const cityModel = ref('')
const postalCodeModel = ref('')
const countryModel = ref<string | undefined>()
const shippingMethodModel = ref<number | undefined>()
const discountModel = ref<string | number>('')
const notesModel = ref('')
const deleteOpen = ref(false)
const convertOpen = ref(false)

// Convert options.
const paymentMethodModel = ref<'manual' | 'cod'>('manual')
const markAsPaidModel = ref(false)
const sendEmailModel = ref(false)

watch(draft, (d) => {
  if (!d) return
  customerIdModel.value = d.user_id != null ? String(d.user_id) : ''
  guestEmailModel.value = d.guest_email ?? ''
  addressModel.value = d.shipping_address ?? ''
  cityModel.value = d.shipping_city ?? ''
  postalCodeModel.value = d.shipping_postal_code ?? ''
  countryModel.value = d.shipping_country ?? undefined
  shippingMethodModel.value = d.shipping_method_id ?? undefined
  discountModel.value = d.discount > 0 ? String(d.discount) : ''
  notesModel.value = d.notes ?? ''
}, { immediate: true })

// The details card + delete/convert modals have no client-validatable fields,
// so they converge only the error message + toast (null form ref pattern —
// see admin/quotes/[id].vue).
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage: formError, applyApiError: applyFormError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})
const { errorMessage: deleteError, applyApiError: applyDeleteError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})
const { errorMessage: convertError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// Shipping methods for the header select (admin list; generous page so the
// dropdown holds the catalog without paging).
const { data: methodsData } = useShippingMethodsQuery(() => ({ page: 1, pageSize: 50 }))
const shippingMethodOptions = computed(() =>
  (methodsData.value?.items ?? []).map(m => ({
    label: localizedShippingMethodName(m, locale.value),
    value: m.id,
  })),
)

const countryItems = computed(() => countryOptions(locale.value as SupportedLocale))

const paymentMethodOptions = computed(() => [
  { label: t('admin.draftOrders.convert.paymentMethods.manual'), value: 'manual' },
  { label: t('admin.draftOrders.convert.paymentMethods.cod'), value: 'cod' },
])

async function onSave() {
  if (!draft.value) return
  formError.value = ''
  const customerIdRaw = String(customerIdModel.value).trim()
  const customerId = customerIdRaw === '' ? null : Number(customerIdRaw)
  if (customerId !== null && (!Number.isInteger(customerId) || customerId < 1)) {
    formError.value = t('admin.draftOrders.errors.invalidCustomerId')
    return
  }
  const discountRaw = String(discountModel.value).trim()
  const discount = discountRaw === '' ? 0 : Number(discountRaw)
  if (!Number.isFinite(discount) || discount < 0) {
    formError.value = t('admin.draftOrders.errors.invalidDiscount')
    return
  }
  // Every header field is sent each save; an explicit null clears a cleared
  // nullable field (the backend applies exactly what's in the body).
  const patch: DraftOrderUpdate = {
    user_id: customerId,
    guest_email: guestEmailModel.value.trim() || null,
    shipping_address: addressModel.value.trim() || null,
    shipping_city: cityModel.value.trim() || null,
    shipping_postal_code: postalCodeModel.value.trim() || null,
    shipping_country: countryModel.value || null,
    shipping_method_id: shippingMethodModel.value ?? null,
    discount,
    notes: notesModel.value.trim() || null,
  }
  try {
    await updateMutation.mutateAsync({ id: draft.value.id, patch })
    toast.add({
      title: t('admin.draftOrders.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    applyFormError(err, t('messages.saveError'))
  }
}

async function onDeleteConfirm() {
  if (!draft.value) return
  deleteError.value = ''
  try {
    await deleteMutation.mutateAsync(draft.value.id)
    deleteOpen.value = false
    toast.add({
      title: t('admin.draftOrders.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo(localePath('/admin/draft-orders'))
  }
  catch (err) {
    applyDeleteError(err, t('messages.saveError'))
  }
}

async function onConvertConfirm() {
  if (!draft.value) return
  convertError.value = ''
  try {
    const order = await convertMutation.mutateAsync({
      id: draft.value.id,
      body: {
        payment_method: paymentMethodModel.value,
        mark_as_paid: markAsPaidModel.value,
        send_email: sendEmailModel.value,
      },
    })
    convertOpen.value = false
    toast.add({
      title: t('admin.draftOrders.convert.flash', { number: order.order_number }),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo(localePath(`/admin/orders/${order.id}`))
  }
  catch (err) {
    // The convert route surfaces its machine reason codes as fixed detail
    // strings — map the recognised ones to actionable i18n messages and show
    // dynamic ones (stock/variant/shipping-rate specifics) verbatim.
    const { message } = normalizeApiError(err, t('messages.saveError'))
    const reason = draftConvertReason(message)
    convertError.value = reason
      ? t(`admin.draftOrders.convert.reasons.${reason}`)
      : message
  }
}

useHead({ title: () => t('admin.draftOrders.detail.title', { id: draft.value?.id ?? '' }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo(localePath('/admin/draft-orders'))"
      >
        {{ $t('admin.draftOrders.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.draftOrders.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="draft">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold font-mono">
              {{ $t('admin.draftOrders.detail.heading', { id: draft.id }) }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ draft.customer_email ?? draft.guest_email ?? $t('admin.draftOrders.detail.noOwner') }}
              <span class="font-mono ml-2">{{ draft.currency }}</span>
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UBadge
              :color="draftOrderStatusColor(draft.status)"
              variant="subtle"
              size="lg"
            >
              {{ $t(`admin.draftOrders.status.${draft.status}`) }}
            </UBadge>
            <UButton
              v-if="isCompleted && draft.converted_order_id != null"
              color="success"
              variant="soft"
              icon="i-lucide-package-check"
              data-testid="draft-order-converted-link"
              @click="navigateTo(localePath(`/admin/orders/${draft.converted_order_id}`))"
            >
              {{ $t('admin.draftOrders.convert.converted') }}
            </UButton>
          </div>
        </header>

        <UAlert
          v-if="isCompleted"
          color="info"
          variant="soft"
          icon="i-lucide-lock"
          :title="$t('admin.draftOrders.detail.completedNotice')"
        />

        <!-- Details (owner + shipping + discount + notes) -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.draftOrders.detail.details') }}
            </h2>
          </template>

          <UAlert
            v-if="formError"
            role="alert"
            color="error"
            variant="soft"
            class="mb-4"
            :title="t('messages.saveErrorTitle')"
            :description="formError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="formError = ''"
          />

          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField
                :label="$t('admin.draftOrders.detail.customerId')"
                :help="$t('admin.draftOrders.detail.customerIdHint')"
              >
                <UInput
                  v-model="customerIdModel"
                  type="number"
                  min="1"
                  step="1"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-customer-id"
                />
              </UFormField>
              <UFormField :label="$t('admin.draftOrders.detail.guestEmail')">
                <UInput
                  v-model="guestEmailModel"
                  type="email"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-guest-email"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField :label="$t('admin.draftOrders.detail.address')">
                <UInput
                  v-model="addressModel"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-address"
                />
              </UFormField>
              <UFormField :label="$t('admin.draftOrders.detail.city')">
                <UInput
                  v-model="cityModel"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-city"
                />
              </UFormField>
              <UFormField :label="$t('admin.draftOrders.detail.postalCode')">
                <UInput
                  v-model="postalCodeModel"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-postal-code"
                />
              </UFormField>
              <UFormField :label="$t('admin.draftOrders.detail.country')">
                <USelect
                  v-model="countryModel"
                  :items="countryItems"
                  value-key="value"
                  :placeholder="$t('admin.draftOrders.detail.countryPlaceholder')"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-country"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField :label="$t('admin.draftOrders.detail.shippingMethod')">
                <USelect
                  v-model="shippingMethodModel"
                  :items="shippingMethodOptions"
                  value-key="value"
                  :placeholder="$t('admin.draftOrders.detail.shippingMethodPlaceholder')"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-shipping-method"
                />
              </UFormField>
              <UFormField
                :label="$t('admin.draftOrders.detail.discount')"
                :help="$t('admin.draftOrders.detail.discountHint', { currency: draft.currency })"
              >
                <UInput
                  v-model="discountModel"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="isCompleted"
                  class="w-full"
                  data-testid="draft-order-discount-input"
                />
              </UFormField>
            </div>

            <UFormField :label="$t('admin.draftOrders.detail.notes')">
              <UTextarea
                v-model="notesModel"
                :rows="3"
                :disabled="isCompleted"
                class="w-full"
                data-testid="draft-order-notes"
              />
            </UFormField>
          </div>

          <template
            v-if="!isCompleted"
            #footer
          >
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <UButton
                color="error"
                variant="soft"
                icon="i-lucide-trash-2"
                data-testid="draft-order-delete"
                @click="deleteError = ''; deleteOpen = true"
              >
                {{ $t('admin.draftOrders.actions.delete') }}
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-save"
                :loading="updateMutation.isLoading.value"
                data-testid="draft-order-save"
                @click="onSave"
              >
                {{ $t('admin.draftOrders.actions.save') }}
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Line items -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.draftOrders.detail.items') }}
            </h2>
          </template>
          <AdminDraftOrderItemsEditor
            :draft="draft"
            :disabled="isCompleted"
          />
        </UCard>

        <!-- Convert -->
        <UCard v-if="!isCompleted">
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.draftOrders.convert.cardTitle') }}
            </h2>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              {{ $t('admin.draftOrders.convert.cardSubtitle') }}
            </p>
            <UFormField :label="$t('admin.draftOrders.convert.paymentMethod')">
              <USelect
                v-model="paymentMethodModel"
                :items="paymentMethodOptions"
                value-key="value"
                class="w-full sm:w-72"
                data-testid="draft-order-payment-method"
              />
            </UFormField>
            <UFormField :help="$t('admin.draftOrders.convert.markAsPaidHint')">
              <USwitch
                v-model="markAsPaidModel"
                :label="$t('admin.draftOrders.convert.markAsPaid')"
                data-testid="draft-order-mark-as-paid"
              />
            </UFormField>
            <UFormField :help="$t('admin.draftOrders.convert.sendEmailHint')">
              <USwitch
                v-model="sendEmailModel"
                :label="$t('admin.draftOrders.convert.sendEmail')"
                data-testid="draft-order-send-email"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end">
              <UButton
                color="primary"
                icon="i-lucide-file-output"
                data-testid="draft-order-convert"
                @click="convertError = ''; convertOpen = true"
              >
                {{ $t('admin.draftOrders.convert.action') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>

      <UModal
        :open="deleteOpen"
        :title="$t('admin.draftOrders.delete.title')"
        :description="$t('admin.draftOrders.delete.body')"
        :dismissible="!deleteMutation.isLoading.value"
        @update:open="(v) => { deleteOpen = v; if (!v) deleteError = '' }"
      >
        <template #body>
          <UAlert
            v-if="deleteError"
            role="alert"
            color="error"
            variant="soft"
            :title="t('messages.saveErrorTitle')"
            :description="deleteError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="deleteError = ''"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="deleteMutation.isLoading.value"
              @click="() => { deleteOpen = false }"
            >
              {{ $t('admin.draftOrders.delete.dismiss') }}
            </UButton>
            <UButton
              color="error"
              :loading="deleteMutation.isLoading.value"
              data-testid="draft-order-delete-confirm"
              @click="onDeleteConfirm"
            >
              {{ $t('admin.draftOrders.delete.confirm') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        :open="convertOpen"
        :title="$t('admin.draftOrders.convert.confirmTitle')"
        :description="$t('admin.draftOrders.convert.confirmBody')"
        :dismissible="!convertMutation.isLoading.value"
        @update:open="(v) => { convertOpen = v; if (!v) convertError = '' }"
      >
        <template #body>
          <UAlert
            v-if="convertError"
            role="alert"
            color="error"
            variant="soft"
            :title="t('messages.saveErrorTitle')"
            :description="convertError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            data-testid="draft-order-convert-error"
            @close="convertError = ''"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="convertMutation.isLoading.value"
              @click="() => { convertOpen = false }"
            >
              {{ $t('admin.draftOrders.convert.dismiss') }}
            </UButton>
            <UButton
              color="primary"
              :loading="convertMutation.isLoading.value"
              data-testid="draft-order-convert-confirm"
              @click="onConvertConfirm"
            >
              {{ $t('admin.draftOrders.convert.confirm') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
