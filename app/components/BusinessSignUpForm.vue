<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import { createBusinessSignUpSchema, type BusinessSignUpFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const { register } = useAuth()
const toast = useToast()
const router = useRouter()

const isLoading = ref(false)
const errorMessage = ref('')

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
      name: 'companyName',
      type: 'text',
      label: t('auth.company.name'),
      placeholder: t('auth.company.enterName'),
      required: true
    },
    {
      name: 'companyTaxId',
      type: 'text',
      label: t('auth.company.taxId'),
      placeholder: t('auth.company.enterTaxId'),
      required: false
    },
    {
      name: 'companyAddressStreet',
      type: 'text',
      label: t('auth.company.address.street'),
      placeholder: t('auth.company.address.enterStreet'),
      required: false
    },
    {
      name: 'companyAddressCity',
      type: 'text',
      label: t('auth.company.address.city'),
      placeholder: t('auth.company.address.enterCity'),
      required: false
    },
    {
      name: 'companyAddressPostalCode',
      type: 'text',
      label: t('auth.company.address.postalCode'),
      placeholder: t('auth.company.address.enterPostalCode'),
      required: false
    },
    {
      name: 'companyAddressCountry',
      type: 'text',
      label: t('auth.company.address.country'),
      placeholder: t('auth.company.address.enterCountry'),
      required: false
    },
    {
      name: 'companyAddressState',
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

const submit = async (payload: FormSubmitEvent<BusinessSignUpFormData>) => {
  isLoading.value = true
  errorMessage.value = ''
  
  const result = await register(payload.data)
  
  isLoading.value = false
  
  if (result.success) {
    toast.add({
      title: t('auth.registrationSuccess'),
      description: t('auth.registrationSuccessDescription'),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    
    // Redirect to home or dashboard
    router.push('/')
  } else {
    errorMessage.value = result.error || t('auth.registrationError')
    toast.add({
      title: t('auth.registrationError'),
      description: errorMessage.value,
      color: 'error',
      icon: 'i-lucide-circle-x'
    })
  }
}
</script>

<template>
  <div class="c-business-sign-up">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="t('auth.registrationError')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      class="mb-4"
      @close="errorMessage = ''"
    />
    
    <UAuthForm
      :schema="schema"
      :fields="fields"
      :title="t('auth.business')"
      icon="i-lucide-building"
      :loading="isLoading"
      @submit="submit"
    >
      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>
