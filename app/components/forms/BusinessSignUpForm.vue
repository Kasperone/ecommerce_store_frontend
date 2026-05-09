<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createBusinessSignUpSchema } from '#shared/validators/auth'
import { normalizeApiError, scrollToFirstFormError } from '~/utils/apiError'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import type { BusinessSignUpFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()

const isLoading = ref(false)
const errorMessage = ref('')
const authFormRef = useTemplateRef<any>('authFormRef')
const confirmPasswordTouched = ref(false)

const fields = computed<AuthFormField[]>(() => {
  void locale.value
  return [
    { name: 'firstName', type: 'text', label: t('auth.firstName'), placeholder: t('auth.enterYourFirstName') },
    { name: 'lastName', type: 'text', label: t('auth.lastName'), placeholder: t('auth.enterYourLastName') },
    { name: 'email', type: 'text', label: t('auth.email'), placeholder: t('auth.enterYourEmail') },
    { name: 'phone', type: 'text', label: t('auth.phone'), placeholder: t('auth.enterYourPhone'), required: false },
    { name: 'password', type: 'password', label: t('auth.password'), placeholder: t('auth.enterYourPassword') },
    { name: 'confirmPassword', type: 'password', label: t('auth.confirmPassword'), placeholder: t('auth.confirmYourPassword') },
    { name: 'companyName', type: 'text', label: t('auth.company.name'), placeholder: t('auth.company.enterName') },
    { name: 'companyTaxId', type: 'text', label: t('auth.company.taxId'), placeholder: t('auth.company.enterTaxId'), required: false },
    { name: 'companyAddressStreet', type: 'text', label: t('auth.company.address.street'), placeholder: t('auth.company.address.enterStreet'), required: false },
    { name: 'companyAddressCity', type: 'text', label: t('auth.company.address.city'), placeholder: t('auth.company.address.enterCity'), required: false },
    { name: 'companyAddressPostalCode', type: 'text', label: t('auth.company.address.postalCode'), placeholder: t('auth.company.address.enterPostalCode'), required: false },
    { name: 'companyAddressCountry', type: 'text', label: t('auth.company.address.country'), placeholder: t('auth.company.address.enterCountry'), required: false },
    { name: 'companyAddressState', type: 'text', label: t('auth.company.address.state'), placeholder: t('auth.company.address.enterState'), required: false }
  ]
})

const schema = computed(() => {
  void locale.value
  return createBusinessSignUpSchema(t)
})

watch(
  () => authFormRef.value?.formRef?.errors,
  (errs) => {
    if (errs && errs.length > 0) {
      nextTick(() => scrollToFirstFormError(errs))
    }
  },
  { deep: true }
)

useFormErrorClearing(authFormRef, errorMessage)

const submit = async (payload: FormSubmitEvent<BusinessSignUpFormData>) => {
  isLoading.value = true
  errorMessage.value = ''

  const result = await authStore.register(payload.data)

  isLoading.value = false

  if (result.success) {
    toast.add({
      title: t('auth.registrationSuccess'),
      description: t('auth.registrationSuccessDescription'),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    router.push(`/verify-email-sent?email=${encodeURIComponent(payload.data.email)}`)
  } else {
    const fallback = t('auth.registrationError')
    const normalized = normalizeApiError(result.raw, result.error || fallback)
    errorMessage.value = normalized.message

    const formApi = authFormRef.value?.formRef
    if (formApi && Object.keys(normalized.fieldErrors).length > 0) {
      formApi.setErrors(
        Object.entries(normalized.fieldErrors).map(([name, message]) => ({ name, message }))
      )
      nextTick(() => scrollToFirstFormError(formApi.errors))
    }

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
    <UAuthForm
      ref="authFormRef"
      :schema="schema"
      :fields="fields"
      :title="t('auth.business')"
      icon="i-lucide-building"
      :validate-on="['submit']"
      :loading="isLoading"
      @submit="submit"
    >
      <template v-if="errorMessage" #validation>
        <UAlert
          color="error"
          variant="soft"
          :title="t('auth.registrationError')"
          :description="errorMessage"
          :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
          @close="errorMessage = ''"
        />
      </template>

      <template #password-field="{ state, field }">
        <UInput
          v-model="state[field.name]"
          v-bind="{
            name: field.name,
            placeholder: field.placeholder,
            autocomplete: 'new-password',
            class: 'w-full'
          }"
          type="password"
        />
        <FormsPasswordStrengthMeter :password="state[field.name]" />
      </template>

      <template #confirmPassword-field="{ state, field }">
        <UInput
          v-model="state[field.name]"
          v-bind="{
            name: field.name,
            placeholder: field.placeholder,
            autocomplete: 'new-password',
            class: 'w-full'
          }"
          type="password"
          @blur="confirmPasswordTouched = true"
        />
        <p
          v-if="confirmPasswordTouched && state[field.name] && state.password && state[field.name] !== state.password"
          class="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {{ t('auth.errors.passwordsDontMatch') }}
        </p>
      </template>

      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>
