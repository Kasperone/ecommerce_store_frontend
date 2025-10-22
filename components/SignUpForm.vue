<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import * as z from 'zod'

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
      name: 'shipping_street',
      type: 'text',
      label: t('auth.shipping.street'),
      placeholder: t('auth.shipping.enterStreet'),
      required: false
    },
    {
      name: 'shipping_city',
      type: 'text',
      label: t('auth.shipping.city'),
      placeholder: t('auth.shipping.enterCity'),
      required: false
    },
    {
      name: 'shipping_postal_code',
      type: 'text',
      label: t('auth.shipping.postalCode'),
      placeholder: t('auth.shipping.enterPostalCode'),
      required: false
    },
    {
      name: 'shipping_country',
      type: 'text',
      label: t('auth.shipping.country'),
      placeholder: t('auth.shipping.enterCountry'),
      required: false
    },
    {
      name: 'shipping_state',
      type: 'text',
      label: t('auth.shipping.state'),
      placeholder: t('auth.shipping.enterState'),
      required: false
    },
    {
      name: 'company_name',
      type: 'text',
      label: t('auth.company.name'),
      placeholder: t('auth.company.enterName'),
      required: false
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
  return z.object({
    firstName: z.string().min(1, { message: t('auth.errors.firstNameRequired', { default: 'First name is required' }) }),
    lastName: z.string().min(1, { message: t('auth.errors.lastNameRequired', { default: 'Last name is required' }) }),
    email: z.email({ message: t('auth.errors.invalidEmail', { default: 'Invalid email' }) }),
    phone: z.string().optional(),
    password: z.string().min(8, { message: t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' }) }).max(100),
    confirmPassword: z.string(),
    shipping_street: z.string().optional().nullable(),
    shipping_city: z.string().optional().nullable(),
    shipping_postal_code: z.string().optional().nullable(),
    shipping_country: z.string().optional().nullable(),
    shipping_state: z.string().optional().nullable(),
    company_name: z.string().optional().nullable(),
    company_tax_id: z.string().optional().nullable(),
    company_address_street: z.string().optional().nullable(),
    company_address_city: z.string().optional().nullable(),
    company_address_postal_code: z.string().optional().nullable(),
    company_address_country: z.string().optional().nullable(),
    company_address_state: z.string().optional().nullable()
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword']
      })
    }
  })
})

type Schema = z.output<typeof schema>

const submit = (payload: FormSubmitEvent<Schema>) => {
  console.log('Submitted', payload)
}
</script>

<template>
  <div class="c-sign-up flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        :title="t('auth.welcome')"
        icon="i-lucide-lock"
        @submit="submit"
      >
        <template #description>
          {{ t('authExtra.noAccount') }} <ULink to="/sign-up" class="text-primary font-medium">{{ t('auth.signUp') }}</ULink>
        </template>

        <template #password-hint>
          <ULink to="/password-recovery" class="text-primary font-medium" tabindex="-1">{{ t('auth.forgotPassword') }}</ULink>
        </template>

        <!-- <template #validation>
          <UAlert color="error" icon="i-lucide-info" :title="t('auth.errorSigningIn')" />
        </template> -->
        
        <template #footer>
          {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>

