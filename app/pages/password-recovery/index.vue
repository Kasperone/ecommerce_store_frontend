<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createForgotPasswordSchema } from '#shared/validators/auth'
import type { AuthFormPublicInstance } from '~/composables/useFormErrorClearing'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import type { ForgotPasswordFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const toast = useToast()

const isLoading = ref(false)
const submitted = ref(false)
const authFormRef = useTemplateRef<AuthFormPublicInstance>('authFormRef')

useFormErrorClearing(authFormRef)

useHead({
  titleTemplate: '%s | Password Recovery',
})

const fields = computed<AuthFormField[]>(() => {
  void locale.value
  return [{
    name: 'email',
    type: 'text',
    label: t('auth.email'),
    placeholder: t('auth.enterYourEmail'),
  }]
})

const schema = computed(() => {
  void locale.value
  return createForgotPasswordSchema(t)
})

const submit = async (payload: FormSubmitEvent<ForgotPasswordFormData>) => {
  isLoading.value = true

  const result = await authStore.requestPasswordReset(payload.data.email)

  isLoading.value = false

  if (result.success) {
    submitted.value = true
    toast.add({
      title: t('auth.passwordReset.requestSent'),
      color: 'success',
      icon: 'i-lucide-mail-check',
    })
  }
  else {
    toast.add({
      title: t('auth.passwordReset.requestSent'),
      // Always show the generic message in toast even on transport error,
      // so the response cannot be used to enumerate accounts.
      color: 'success',
      icon: 'i-lucide-mail-check',
    })
    submitted.value = true
  }
}
</script>

<template>
  <div class="p-password-recovery flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md">
      <template v-if="!submitted">
        <div class="flex flex-col text-center mb-6">
          <div class="mb-2">
            <UIcon
              name="i-lucide-key-round"
              class="size-8 inline-block"
            />
          </div>
          <h1 class="text-xl text-pretty font-semibold text-highlighted">
            {{ t('auth.passwordReset.requestTitle') }}
          </h1>
          <p class="mt-1 text-base text-pretty text-muted">
            {{ t('auth.passwordReset.requestDescription') }}
          </p>
        </div>
        <UAuthForm
          ref="authFormRef"
          :schema="schema"
          :fields="fields"
          :submit="{ label: t('auth.passwordReset.requestSubmit'), loading: isLoading }"
          :validate-on="['submit']"
          @submit="submit"
        >
          <template #footer>
            <ULink
              to="/login"
              class="text-primary font-medium"
            >{{ t('auth.passwordReset.goToLogin') }}</ULink>
          </template>
        </UAuthForm>
      </template>

      <div
        v-else
        class="py-8 text-center space-y-4"
      >
        <div class="flex justify-center mb-2">
          <div class="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
            <UIcon
              name="i-lucide-mail-check"
              class="w-8 h-8 text-success"
            />
          </div>
        </div>
        <h1 class="text-2xl font-bold">
          {{ t('auth.passwordReset.requestTitle') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('auth.passwordReset.requestSent') }}
        </p>
        <UButton
          :label="t('auth.passwordReset.goToLogin')"
          color="primary"
          variant="outline"
          block
          to="/login"
        />
      </div>
    </UPageCard>
  </div>
</template>
