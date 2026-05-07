<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { createLoginSchema } from '#shared/validators/auth'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'
import type { LoginFormData } from '#shared/validators/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()

const isLoading = ref(false)
const errorMessage = ref('')

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
  type: 'password',
  label: t('auth.password'),
  placeholder: t('auth.enterYourPassword'),
  required: true
}, {
  name: 'remember',
  type: 'checkbox',
  label: t('auth.rememberMe')
 }]
})

const schema = computed(() => {
  // ensure recompute when locale changes
  void locale.value
  return createLoginSchema(t)
})

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
    errorMessage.value = result.error || t('auth.errorSigningIn')
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

