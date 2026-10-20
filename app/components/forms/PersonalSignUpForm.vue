<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createPersonalSignUpSchema } from '#shared/validators/auth'
import { normalizeApiError, scrollToFirstFormError } from '~/utils/apiError'
import type { AuthFormPublicInstance } from '~/composables/useFormErrorClearing'
import type { PersonalSignUpFormData } from '#shared/validators/auth'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()

const isLoading = ref(false)
const errorMessage = ref('')
const authFormRef = useTemplateRef<AuthFormPublicInstance>('authFormRef')
const confirmPasswordTouched = ref(false)

// Input-only fields keyed by the form's state, so `state[field.name]` and `field.placeholder` type-check in slots.
type InputField = Exclude<AuthFormField, { type: 'checkbox' | 'select' | 'otp' }> & { name: keyof PersonalSignUpFormData }
const fields = computed<InputField[]>(() => {
  void locale.value
  return [
    { name: 'firstName', type: 'text', label: t('auth.firstName'), placeholder: t('auth.enterYourFirstName') },
    { name: 'lastName', type: 'text', label: t('auth.lastName'), placeholder: t('auth.enterYourLastName') },
    { name: 'email', type: 'text', label: t('auth.email'), placeholder: t('auth.enterYourEmail') },
    { name: 'phone', type: 'text', label: t('auth.phone'), placeholder: t('auth.enterYourPhone'), required: false },
    { name: 'password', type: 'password', label: t('auth.password'), placeholder: t('auth.enterYourPassword') },
    { name: 'confirmPassword', type: 'password', label: t('auth.confirmPassword'), placeholder: t('auth.confirmYourPassword') },
  ]
})

const schema = computed(() => {
  void locale.value
  return createPersonalSignUpSchema(t)
})

watch(
  () => authFormRef.value?.formRef?.errors,
  (errs) => {
    if (errs && errs.length > 0) {
      nextTick(() => scrollToFirstFormError(errs))
    }
  },
  { deep: true },
)

useFormErrorClearing(authFormRef, errorMessage)

const submit = async (payload: FormSubmitEvent<PersonalSignUpFormData>) => {
  isLoading.value = true
  errorMessage.value = ''

  const result = await authStore.register(payload.data, locale.value as 'en' | 'pl')

  isLoading.value = false

  if (result.success) {
    toast.add({
      title: t('auth.registrationSuccess'),
      description: t('auth.registrationSuccessDescription'),
      color: 'success',
      icon: 'i-lucide-check-circle',
    })

    router.push(localePath({ path: '/verify-email-sent', query: { email: payload.data.email } }))
  }
  else {
    const fallback = t('auth.registrationError')
    const normalized = normalizeApiError(result.raw, result.error || fallback)
    errorMessage.value = normalized.message

    const formApi = authFormRef.value?.formRef
    if (formApi && Object.keys(normalized.fieldErrors).length > 0) {
      formApi.setErrors(
        Object.entries(normalized.fieldErrors).map(([name, message]) => ({ name, message })),
      )
      nextTick(() => scrollToFirstFormError(formApi.errors))
    }

    toast.add({
      title: t('auth.registrationError'),
      description: errorMessage.value,
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
}
</script>

<template>
  <div class="c-personal-sign-up">
    <div class="flex flex-col text-center mb-6">
      <div class="mb-2">
        <UIcon
          name="i-lucide-user"
          class="size-8 inline-block"
        />
      </div>
      <h2 class="text-xl text-pretty font-semibold text-highlighted">
        {{ t('auth.personal') }}
      </h2>
    </div>
    <UAuthForm
      ref="authFormRef"
      :schema="schema"
      :fields="fields"
      :validate-on="[]"
      :loading="isLoading"
      @submit="submit"
    >
      <template
        v-if="errorMessage"
        #validation
      >
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
          v-model="state.password"
          v-bind="{
            name: field.name,
            placeholder: field.placeholder,
            autocomplete: 'new-password',
            class: 'w-full',
          }"
          type="password"
        />
        <FormsPasswordStrengthMeter :password="state.password" />
      </template>

      <template #confirmPassword-field="{ state, field }">
        <UInput
          v-model="state.confirmPassword"
          v-bind="{
            name: field.name,
            placeholder: field.placeholder,
            autocomplete: 'new-password',
            class: 'w-full',
          }"
          type="password"
          @blur="confirmPasswordTouched = true"
        />
        <p
          v-if="confirmPasswordTouched
            && state.confirmPassword
            && state.password
            && state.confirmPassword !== state.password"
          class="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {{ t('auth.errors.passwordsDontMatch') }}
        </p>
      </template>

      <template #footer>
        {{ t('authExtra.agreeTo') }} <ULink
          :to="localePath('/terms-of-service')"
          class="text-primary font-medium"
        >{{ t('auth.termsOfService') }}</ULink>
      </template>
    </UAuthForm>
  </div>
</template>
