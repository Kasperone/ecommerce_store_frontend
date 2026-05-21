<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createResetPasswordSchema } from '#shared/validators/auth'
import type { AuthFormPublicInstance } from '~/composables/useFormErrorClearing'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import type { ResetPasswordFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const token = computed(() => String(route.params.token ?? ''))

const isLoading = ref(false)
const isSuccess = ref(false)
const errorMessage = ref('')
const authFormRef = useTemplateRef<AuthFormPublicInstance>('authFormRef')

useFormErrorClearing(authFormRef, errorMessage)

useHead({
  titleTemplate: '%s | Reset Password',
})

const fields = computed<AuthFormField[]>(() => {
  void locale.value
  return [{
    name: 'password',
    type: 'password',
    label: t('auth.passwordReset.newPassword'),
    placeholder: t('auth.passwordReset.enterNewPassword'),
  }, {
    name: 'confirmPassword',
    type: 'password',
    label: t('auth.passwordReset.confirmNewPassword'),
    placeholder: t('auth.confirmYourPassword'),
  }]
})

const schema = computed(() => {
  void locale.value
  return createResetPasswordSchema(t)
})

// Pre-populate the (hidden) token from the URL so the schema sees it.
const initial = computed(() => ({
  token: token.value,
  password: '',
  confirmPassword: '',
}))

const submit = async (payload: FormSubmitEvent<ResetPasswordFormData>) => {
  if (!token.value) {
    errorMessage.value = t('auth.passwordReset.tokenMissing')
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  const result = await authStore.confirmPasswordReset(token.value, payload.data.password)

  isLoading.value = false

  if (result.success) {
    isSuccess.value = true
    toast.add({
      title: t('auth.passwordReset.confirmSuccess'),
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
    setTimeout(() => router.push('/login'), 2000)
  }
  else {
    errorMessage.value = result.error || t('auth.passwordReset.confirmError')
    toast.add({
      title: errorMessage.value,
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
}
</script>

<template>
  <div class="p-password-reset flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md">
      <div
        v-if="!token"
        class="py-8 text-center space-y-4"
      >
        <UIcon
          name="i-lucide-circle-x"
          class="w-12 h-12 text-error mx-auto"
        />
        <h1 class="text-2xl font-bold">
          {{ t('auth.passwordReset.confirmError') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('auth.passwordReset.tokenMissing') }}
        </p>
        <UButton
          :label="t('auth.passwordReset.requestNew')"
          color="primary"
          block
          to="/password-recovery"
        />
      </div>

      <div
        v-else-if="isSuccess"
        class="py-8 text-center space-y-4"
      >
        <div class="flex justify-center">
          <div class="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
            <UIcon
              name="i-lucide-check-circle"
              class="w-8 h-8 text-success"
            />
          </div>
        </div>
        <h1 class="text-2xl font-bold">
          {{ t('auth.passwordReset.confirmSuccess') }}
        </h1>
        <UButton
          :label="t('auth.passwordReset.goToLogin')"
          color="primary"
          block
          to="/login"
        />
      </div>

      <template v-else>
        <div class="flex flex-col text-center mb-6">
          <div class="mb-2">
            <UIcon
              name="i-lucide-key-round"
              class="size-8 inline-block"
            />
          </div>
          <h1 class="text-xl text-pretty font-semibold text-highlighted">
            {{ t('auth.passwordReset.confirmTitle') }}
          </h1>
          <p class="mt-1 text-base text-pretty text-muted">
            {{ t('auth.passwordReset.confirmDescription') }}
          </p>
        </div>
        <UAuthForm
          ref="authFormRef"
          :schema="schema"
          :fields="fields"
          :state="initial"
          :submit="{ label: t('auth.passwordReset.confirmSubmit'), loading: isLoading }"
          :validate-on="['submit']"
          @submit="submit"
        >
          <template #password-field="{ state, field }">
            <UInput
              v-model="state[field.name]"
              v-bind="{
                name: field.name,
                placeholder: field.placeholder,
                autocomplete: 'new-password',
                class: 'w-full',
              }"
              type="password"
            />
            <FormsPasswordStrengthMeter
              v-if="field.name === 'password'"
              :password="state[field.name]"
            />
          </template>
          <template
            v-if="errorMessage"
            #validation
          >
            <UAlert
              color="error"
              variant="soft"
              :title="t('auth.passwordReset.confirmError')"
              :description="errorMessage"
              :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
              @close="errorMessage = ''"
            />
          </template>

          <template #footer>
            <ULink
              to="/password-recovery"
              class="text-primary font-medium"
            >{{ t('auth.passwordReset.requestNew') }}</ULink>
          </template>
        </UAuthForm>
      </template>
    </UPageCard>
  </div>
</template>
