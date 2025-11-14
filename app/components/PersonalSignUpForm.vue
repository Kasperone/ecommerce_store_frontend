<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import { createPersonalSignUpSchema, type PersonalSignUpFormData } from '#shared/validators/auth'

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
      name: 'shippingStreet',
      type: 'text',
      label: t('auth.shipping.street'),
      placeholder: t('auth.shipping.enterStreet'),
      required: false
    },
    {
      name: 'shippingCity',
      type: 'text',
      label: t('auth.shipping.city'),
      placeholder: t('auth.shipping.enterCity'),
      required: false
    },
    {
      name: 'shippingPostalCode',
      type: 'text',
      label: t('auth.shipping.postalCode'),
      placeholder: t('auth.shipping.enterPostalCode'),
      required: false
    },
    {
      name: 'shippingCountry',
      type: 'text',
      label: t('auth.shipping.country'),
      placeholder: t('auth.shipping.enterCountry'),
      required: false
    },
    {
      name: 'shippingState',
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

const submit = async (payload: FormSubmitEvent<PersonalSignUpFormData>) => {
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
  <div class="c-personal-sign-up">
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
      :title="t('auth.personal')"
      icon="i-lucide-user"
      :loading="isLoading"
      @submit="submit"
    >
      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>
