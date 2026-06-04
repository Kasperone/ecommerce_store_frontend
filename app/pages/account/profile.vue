<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { createProfileSchema, type ProfileFormData } from '#shared/validators/profile'

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToast()

useHead({
  titleTemplate: '%s | Account',
})

interface FormState {
  first_name: string
  last_name: string
  phone: string
}

const state = reactive<FormState>({
  first_name: '',
  last_name: '',
  phone: '',
})

// Seed from the loaded user; keep in step if the store refreshes it (mirrors the
// account/index.vue email-locale pattern). `immediate` so an already-loaded user
// prefills the fields on first mount.
watch(
  () => authStore.user,
  (user) => {
    if (!user) return
    state.first_name = user.first_name ?? ''
    state.last_name = user.last_name ?? ''
    state.phone = user.phone ?? ''
  },
  { immediate: true },
)

const schema = computed(() => createProfileSchema(t))

function validate(values: FormState): FormError[] {
  const result = schema.value.safeParse(values)
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

const saving = ref(false)

async function onSubmit(_event: FormSubmitEvent<ProfileFormData>) {
  saving.value = true
  const phone = state.phone.trim()
  const result = await authStore.updateProfile({
    first_name: state.first_name.trim(),
    last_name: state.last_name.trim(),
    // Send null (not '') when cleared so the backend stores an absent phone.
    phone: phone === '' ? null : phone,
  })
  saving.value = false

  if (result.success) {
    toast.add({ title: t('account.settings.profile.saved'), color: 'success' })
  }
  else {
    toast.add({
      title: result.error ?? t('account.settings.profile.error'),
      color: 'error',
    })
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-profile p-6 max-w-2xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.profile.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.profile.subtitle') }}
        </p>
      </div>

      <UCard>
        <UForm
          :state="state"
          :validate="validate"
          :validate-on="['submit']"
          class="space-y-6"
          @submit="onSubmit"
        >
          <UFormField
            :label="t('account.settings.profile.firstName')"
            name="first_name"
            required
          >
            <UInput
              v-model="state.first_name"
              autocomplete="given-name"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('account.settings.profile.lastName')"
            name="last_name"
            required
          >
            <UInput
              v-model="state.last_name"
              autocomplete="family-name"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('account.settings.profile.phone')"
            :help="t('account.settings.profile.phoneHint')"
            name="phone"
          >
            <UInput
              v-model="state.phone"
              type="tel"
              autocomplete="tel"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('account.settings.profile.email')"
            :help="t('account.settings.profile.emailHint')"
            name="email"
          >
            <UInput
              :model-value="authStore.user?.email ?? ''"
              type="email"
              disabled
              readonly
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton
              type="submit"
              color="primary"
              :loading="saving"
            >
              {{ t('account.settings.profile.save') }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </div>
  </NuxtLayout>
</template>
