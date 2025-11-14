<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import { createBusinessSignUpSchema, type BusinessSignUpFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()

const fields = computed<AuthFormField[]>(() => {
  // ensure computed re-runs when locale changes
  void locale.value
  return [
    {
      name: 'firstName',
      type: 'text',
      label: t('auth.firstName'),
      placeholder: t('auth.enterYourFirstName'),
      required: true
    },
    {
      name: 'lastName',
      type: 'text',
      label: t('auth.lastName'),
      placeholder: t('auth.enterYourLastName'),
      required: true
    },
    {
      name: 'email',
      type: 'email',
      label: t('auth.email'),
      placeholder: t('auth.enterYourEmail'),
      required: true
    },
    {
      name: 'phone',
      label: t('auth.phone'),
      type: 'text',
      placeholder: t('auth.enterYourPhone'),
      required: false
    },
    {
      name: 'password',
      label: t('auth.password'),
      type: 'password',
      placeholder: t('auth.enterYourPassword'),
      required: true
    },
    {
      name: 'confirmPassword',
      label: t('auth.confirmPassword'),
      type: 'password',
      placeholder: t('auth.confirmYourPassword'),
      required: true
    },
    {
      name: 'company_name',
      type: 'text',
      label: t('auth.company.name'),
      placeholder: t('auth.company.enterName'),
      required: true
    },
    {
      name: 'company_tax_id',
      type: 'text',
      label: t('auth.company.taxId'),
      placeholder: t('auth.company.enterTaxId'),
      required: false
    },
    {
      name: 'company_address_street',
      type: 'text',
      label: t('auth.company.address.street'),
      placeholder: t('auth.company.address.enterStreet'),
      required: false
    },
    {
      name: 'company_address_city',
      type: 'text',
      label: t('auth.company.address.city'),
      placeholder: t('auth.company.address.enterCity'),
      required: false
    },
    {
      name: 'company_address_postal_code',
      type: 'text',
      label: t('auth.company.address.postalCode'),
      placeholder: t('auth.company.address.enterPostalCode'),
      required: false
    },
    {
      name: 'company_address_country',
      type: 'text',
      label: t('auth.company.address.country'),
      placeholder: t('auth.company.address.enterCountry'),
      required: false
    },
    {
      name: 'company_address_state',
      type: 'text',
      label: t('auth.company.address.state'),
      placeholder: t('auth.company.address.enterState'),
      required: false
    }
  ]
})

const schema = computed(() => {
  // ensure recompute when locale changes
  void locale.value
  return createBusinessSignUpSchema(t)
})

const submit = (payload: FormSubmitEvent<BusinessSignUpFormData>) => {
  console.log('Business signup submitted:', payload)
}
</script>

<template>
  <div class="c-business-sign-up">
    <UAuthForm
      :schema="schema"
      :fields="fields"
      :title="t('auth.business')"
      icon="i-lucide-building"
      @submit="submit"
    >
      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>