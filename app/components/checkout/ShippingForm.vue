<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { countryOptions } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import { createShippingSchema } from '#shared/validators/checkout'
import type { ShippingInput } from '#shared/validators/checkout'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{
  initial?: Partial<ShippingInput>
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
  /** Disabled when the page-level submit guard hasn't yet got a method id. */
  submitDisabled?: boolean
  /**
   * Guest checkout (no bearer): renders a required contact-email field above
   * the address block + a "sign in instead" hint. The email rides on the
   * submit payload as `email` → the page maps it to `guest_email`.
   */
  guest?: boolean
}>()

const emit = defineEmits<{
  'submit': [values: ShippingInput]
  /**
   * Country changes are surfaced upward so the page can re-quote shipping for
   * the new country without prop-drilling reactive form state in the other
   * direction.
   */
  'update:country': [code: string]
}>()

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const schema = computed(() => createShippingSchema(t, { guest: props.guest }))

// USelect option list — localized by the current UI locale; sorted with PL
// first per the project's PL-market default.
const countryItems = computed(() => countryOptions(locale.value as SupportedLocale))

const state = reactive<ShippingInput>({
  email: '',
  address: props.initial?.address ?? '',
  city: props.initial?.city ?? '',
  postalCode: props.initial?.postalCode ?? '',
  country: props.initial?.country ?? '',
  notes: props.initial?.notes ?? '',
})

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'checkout.errorTitle',
})

// The page owns the order-creation fetch; surface its raw error here so the
// shipping form drives the same flow as signin (message + field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('checkout.error', { default: 'Could not place your order' }))
    else errorMessage.value = ''
  },
)

// Profile may resolve after mount; backfill empty fields from the prefill once.
watch(() => props.initial, (incoming) => {
  if (!incoming) return
  if (!state.address && incoming.address) state.address = incoming.address
  if (!state.city && incoming.city) state.city = incoming.city
  if (!state.postalCode && incoming.postalCode) state.postalCode = incoming.postalCode
  if (!state.country && incoming.country) state.country = incoming.country
})

// Push country up to the page (initial value + every change). The selector
// re-quotes when this changes.
watch(() => state.country, (code) => {
  emit('update:country', code)
}, { immediate: true })

function onSubmit(event: { data: ShippingInput }) {
  emit('submit', event.data)
}
</script>

<template>
  <UForm
    ref="formRef"
    :schema="schema"
    :state="state"
    :validate-on="['submit']"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="t('checkout.errorTitle', { default: 'Could not place your order' })"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      @close="errorMessage = ''"
    />

    <template v-if="guest">
      <p
        class="text-sm text-muted"
        data-testid="guest-hint"
      >
        {{ t('checkout.guest.hint') }}
        <ULink
          :to="localePath({ path: '/login', query: { redirect: localePath('/checkout') } })"
          class="text-primary hover:underline"
        >
          {{ t('checkout.guest.signIn') }}
        </ULink>
      </p>
      <UFormField
        :label="t('checkout.guest.email')"
        name="email"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          class="w-full"
          data-testid="guest-email"
        />
      </UFormField>
    </template>

    <UFormField
      :label="t('checkout.shipping.address')"
      name="address"
      required
    >
      <UInput
        v-model="state.address"
        class="w-full"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('checkout.shipping.city')"
        name="city"
        required
      >
        <UInput
          v-model="state.city"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('checkout.shipping.postalCode')"
        name="postalCode"
        required
      >
        <UInput
          v-model="state.postalCode"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('checkout.shipping.country')"
      name="country"
      required
    >
      <USelect
        v-model="state.country"
        :items="countryItems"
        :placeholder="t('checkout.shipping.countryPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="t('checkout.shipping.notes')"
      name="notes"
    >
      <UTextarea
        v-model="state.notes"
        :placeholder="t('checkout.shipping.notesPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UButton
      type="submit"
      color="primary"
      block
      :loading="loading"
      :disabled="submitDisabled"
    >
      {{ t('checkout.placeOrder') }}
    </UButton>
  </UForm>
</template>
