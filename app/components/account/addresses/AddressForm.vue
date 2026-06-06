<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { countryOptions } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import { createAddressSchema } from '#shared/validators/address'
import type { AddressInput } from '#shared/validators/address'
import type { Address } from '~/composables/queries/useAddresses'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

/**
 * Address add/edit form. Stateless + parent-driven: the page owns the
 * create/update mutations and the modal that wraps this; the form validates
 * against `createAddressSchema` and emits the typed payload on submit. When
 * `address` is supplied the fields are seeded for editing.
 *
 * Every field is labelled (UFormField `label`) for EAA conformance; the
 * shipping/billing default flags are plain checkboxes (server enforces mutual
 * exclusion).
 */

const props = defineProps<{
  address?: Address | null
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  submit: [values: AddressInput]
  cancel: []
}>()

const { t, locale } = useI18n()
const toast = useToast()
const schema = computed(() => {
  void locale.value
  return createAddressSchema(t)
})

const countryItems = computed(() => countryOptions(locale.value as SupportedLocale))

const state = reactive<AddressInput>({
  label: props.address?.label ?? '',
  recipient_name: props.address?.recipient_name ?? '',
  street: props.address?.street ?? '',
  city: props.address?.city ?? '',
  postal_code: props.address?.postal_code ?? '',
  country: props.address?.country ?? '',
  state: props.address?.state ?? '',
  phone: props.address?.phone ?? '',
  is_default_shipping: props.address?.is_default_shipping ?? false,
  is_default_billing: props.address?.is_default_billing ?? false,
})

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'account.settings.addresses.saveError',
})

// The page owns the create/update mutation; surface its raw error here so the
// form drives the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('account.settings.addresses.saveError'))
    else errorMessage.value = ''
  },
)

function onSubmit(event: { data: AddressInput }) {
  emit('submit', event.data)
}

// Exposed so component/page tests can seed the non-native country <USelect>,
// which can't be driven through happy-dom's DOM events.
defineExpose({ state })
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
      :title="t('account.settings.addresses.saveError')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      @close="errorMessage = ''"
    />
    <UFormField
      :label="t('account.settings.addresses.form.label')"
      :help="t('account.settings.addresses.form.labelHint')"
      name="label"
    >
      <UInput
        v-model="state.label"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="t('account.settings.addresses.form.recipientName')"
      name="recipient_name"
      required
    >
      <UInput
        v-model="state.recipient_name"
        autocomplete="name"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="t('account.settings.addresses.form.street')"
      name="street"
      required
    >
      <UInput
        v-model="state.street"
        autocomplete="street-address"
        class="w-full"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.addresses.form.city')"
        name="city"
        required
      >
        <UInput
          v-model="state.city"
          autocomplete="address-level2"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.addresses.form.postalCode')"
        name="postal_code"
        required
      >
        <UInput
          v-model="state.postal_code"
          autocomplete="postal-code"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.addresses.form.country')"
        name="country"
        required
      >
        <USelect
          v-model="state.country"
          :items="countryItems"
          :placeholder="t('account.settings.addresses.form.countryPlaceholder')"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.addresses.form.state')"
        name="state"
      >
        <UInput
          v-model="state.state"
          autocomplete="address-level1"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('account.settings.addresses.form.phone')"
      name="phone"
    >
      <UInput
        v-model="state.phone"
        autocomplete="tel"
        class="w-full"
      />
    </UFormField>

    <div class="space-y-2">
      <UCheckbox
        v-model="state.is_default_shipping"
        :label="t('account.settings.addresses.form.defaultShipping')"
      />
      <UCheckbox
        v-model="state.is_default_billing"
        :label="t('account.settings.addresses.form.defaultBilling')"
      />
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <UButton
        color="neutral"
        variant="soft"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ t('account.settings.addresses.form.cancel') }}
      </UButton>
      <UButton
        type="submit"
        color="primary"
        :loading="loading"
      >
        {{ t('account.settings.addresses.form.save') }}
      </UButton>
    </div>
  </UForm>
</template>
