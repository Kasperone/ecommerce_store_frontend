<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createLoginSchema } from '#shared/validators/auth'
import { normalizeApiError, scrollToFirstFormError } from '~/utils/apiError'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import type { LoginFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()

const isLoading = ref(false)
const errorMessage = ref('')
const authFormRef = useTemplateRef<any>('authFormRef')

const fields = computed<AuthFormField[]>(() => {
  void locale.value
  return [{
    name: 'email',
    type: 'text',
    label: t('auth.email'),
    placeholder: t('auth.enterYourEmail')
  }, {
    name: 'password',
    type: 'password',
    label: t('auth.password'),
    placeholder: t('auth.enterYourPassword')
  }, {
    name: 'remember',
    type: 'checkbox',
    label: t('auth.rememberMe')
  }]
})

const schema = computed(() => {
  void locale.value
  return createLoginSchema(t)
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

const submit = async (payload: FormSubmitEvent<LoginFormData>) => {
  isLoading.value = true
  errorMessage.value = ''

  const result = await authStore.login(payload.data.email, payload.data.password)

  isLoading.value = false

  if (result.success) {
    toast.add({
      title: t('auth.welcome'),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    const redirectQuery = typeof route.query.redirect === 'string' ? route.query.redirect : null
    const redirect = redirectQuery ?? (authStore.isAdmin ? '/admin' : '/')
    router.push(redirect)
  } else {
    const fallback = t('auth.errorSigningIn')
    const normalized = normalizeApiError(result.raw, result.error || fallback)
    errorMessage.value = normalized.message

    // Surface backend field errors under the matching inputs.
    const formApi = authFormRef.value?.formRef
    if (formApi && Object.keys(normalized.fieldErrors).length > 0) {
      formApi.setErrors(
        Object.entries(normalized.fieldErrors).map(([name, message]) => ({ name, message }))
      )
      nextTick(() => scrollToFirstFormError(formApi.errors))
    }

    toast.add({
      title: t('auth.errorSigningIn'),
      description: errorMessage.value,
      color: 'error',
      icon: 'i-lucide-circle-x'
    })
  }
}
</script>

<template>
  <div class="c-login-form flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        ref="authFormRef"
        :schema="schema"
        :fields="fields"
        :title="t('auth.welcome')"
        icon="i-lucide-lock"
        :validate-on="['blur', 'submit']"
        :loading="isLoading"
        @submit="submit"
      >
        <template #description>
          {{ t('authExtra.noAccount') }} <ULink to="/sign-up" class="text-primary font-medium">{{ t('auth.signUp') }}</ULink>
        </template>

        <template v-if="errorMessage" #validation>
          <UAlert
            color="error"
            variant="soft"
            :title="t('auth.errorSigningIn')"
            :description="errorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="errorMessage = ''"
          />
        </template>

        <template #password-hint>
          <ULink to="/password-recovery" class="text-primary font-medium" tabindex="-1">{{ t('auth.forgotPassword') }}</ULink>
        </template>

        <template #footer>
          {{ t('authExtra.agreeTo') }} <ULink to="/terms-of-service" class="text-primary font-medium">{{ t('auth.termsOfService') }}</ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
