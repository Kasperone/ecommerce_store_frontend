<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import { createPersonalSignUpSchema, type PersonalSignUpFormData } from '#shared/validators/auth'

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
    }
  ]
})

const schema = computed(() => {
  // ensure recompute when locale changes
  void locale.value
  return createPersonalSignUpSchema(t)
})

const submit = (payload: FormSubmitEvent<PersonalSignUpFormData>) => {
  console.log('Personal signup submitted:', payload)
}
</script>

<template>
  <div class="c-personal-sign-up">
    <UAuthForm
      :schema="schema"
      :fields="fields"
      :title="t('auth.personal')"
      icon="i-lucide-user"
      @submit="submit"
    >
      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>