<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createCompanyProfileSchema } from '#shared/validators/companyProfile'
import type { CompanyProfileInput } from '#shared/validators/companyProfile'
import type { CompanyMe } from '~/composables/queries/useCompany'

/**
 * COMPANY_ADMIN-editable company-profile form (D-D-4 narrow allow-list: contact
 * + billing address + default currency). Stateless + parent-driven: the page
 * owns the PATCH mutation, the rollback and the toast; this form just seeds from
 * the current company, validates against `createCompanyProfileSchema`, and emits
 * the typed payload on submit.
 *
 * Every field is labelled (UFormField `label`) for EAA conformance. `name` and
 * `status` are intentionally absent — they're admin-directory concerns, not
 * editable here (the backend allow-list drops them anyway).
 */

const props = defineProps<{
  company: CompanyMe
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [values: CompanyProfileInput]
}>()

const { t } = useI18n()
const schema = computed(() => createCompanyProfileSchema(t))

const state = reactive<CompanyProfileInput>({
  tax_id: props.company.tax_id ?? '',
  regon: props.company.regon ?? '',
  email: props.company.email ?? '',
  phone: props.company.phone ?? '',
  billing_address_street: props.company.billing_address_street ?? '',
  billing_address_city: props.company.billing_address_city ?? '',
  billing_address_postal_code: props.company.billing_address_postal_code ?? '',
  billing_address_country: props.company.billing_address_country ?? '',
  billing_address_state: props.company.billing_address_state ?? '',
  default_currency: props.company.default_currency ?? '',
})

function onSubmit(event: { data: CompanyProfileInput }) {
  emit('submit', event.data)
}

// Exposed so component/page tests can drive fields the non-native way if needed.
defineExpose({ state })
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    :validate-on="['submit']"
    class="space-y-6"
    @submit="onSubmit"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.company.fields.taxId')"
        name="tax_id"
      >
        <UInput
          v-model="state.tax_id"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.company.fields.regon')"
        name="regon"
      >
        <UInput
          v-model="state.regon"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.company.fields.email')"
        name="email"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.company.fields.phone')"
        name="phone"
      >
        <UInput
          v-model="state.phone"
          type="tel"
          autocomplete="tel"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('account.settings.company.fields.street')"
      name="billing_address_street"
    >
      <UInput
        v-model="state.billing_address_street"
        autocomplete="street-address"
        :disabled="loading"
        class="w-full"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.company.fields.city')"
        name="billing_address_city"
      >
        <UInput
          v-model="state.billing_address_city"
          autocomplete="address-level2"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.company.fields.postalCode')"
        name="billing_address_postal_code"
      >
        <UInput
          v-model="state.billing_address_postal_code"
          autocomplete="postal-code"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('account.settings.company.fields.country')"
        name="billing_address_country"
      >
        <UInput
          v-model="state.billing_address_country"
          autocomplete="country-name"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.settings.company.fields.state')"
        name="billing_address_state"
      >
        <UInput
          v-model="state.billing_address_state"
          autocomplete="address-level1"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('account.settings.company.fields.defaultCurrency')"
      :help="t('account.settings.company.fields.defaultCurrencyHint')"
      name="default_currency"
    >
      <UInput
        v-model="state.default_currency"
        :placeholder="t('account.settings.company.fields.defaultCurrencyPlaceholder')"
        :disabled="loading"
        class="w-full sm:max-w-40"
      />
    </UFormField>

    <div class="flex justify-end pt-2">
      <UButton
        type="submit"
        color="primary"
        :loading="loading"
      >
        {{ t('account.settings.company.save') }}
      </UButton>
    </div>
  </UForm>
</template>
