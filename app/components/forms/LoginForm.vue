<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import { createLoginSchema, type LoginFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()

const fields = computed<AuthFormField[]>(() => {
  // ensure computed re-runs when locale changes
  void locale.value
  return [{
  name: 'email',
  type: 'email',
  label: t('auth.email'),
  placeholder: t('auth.enterYourEmail'),
  required: true
}, {
  name: 'password',
  label: t('auth.password'),
  type: 'password',
  placeholder: t('auth.enterYourPassword'),
  required: true
}, {
  name: 'remember',
  label: t('auth.rememberMe'),
  type: 'checkbox'
 }]
})

const schema = computed(() => {
  // ensure recompute when locale changes
  void locale.value
  return createLoginSchema(t)
})

const submit = (payload: FormSubmitEvent<LoginFormData>) => {
  console.log('Submitted', payload)
}
</script>

<template>
  <div class="c-login-form flex flex-col items-center justify-center gap-4 p-4">
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

