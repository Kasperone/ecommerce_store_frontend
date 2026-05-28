<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const localePath = useLocalePath()
const toast = useToast()

useHead({
  titleTemplate: '%s | Account',
})

// Email-language preference (drives transactional emails; independent of the UI
// language toggle). Seeded from the loaded user, kept in step if it refreshes.
const emailLocale = ref<'en' | 'pl'>(authStore.user?.locale ?? 'en')
const savingLocale = ref(false)
const localeOptions = computed(() => [
  { label: t('account.emailLanguage.en'), value: 'en' },
  { label: t('account.emailLanguage.pl'), value: 'pl' },
])

watch(() => authStore.user?.locale, (value) => {
  if (value) emailLocale.value = value
})

async function onEmailLocaleChange(value: unknown) {
  const next = value as 'en' | 'pl'
  if (next === authStore.user?.locale) return
  emailLocale.value = next
  savingLocale.value = true
  const result = await authStore.updateProfile({ locale: next })
  savingLocale.value = false
  if (result.success) {
    toast.add({ title: t('account.emailLanguage.saved'), color: 'success' })
  }
  else {
    emailLocale.value = authStore.user?.locale ?? 'en' // roll back on failure
    toast.add({ title: result.error ?? t('account.emailLanguage.error'), color: 'error' })
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-dashboard p-6 max-w-5xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.dashboard') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.signedInAs') }} <span class="font-medium">{{ authStore.user?.email }}</span>
        </p>
      </div>

      <NuxtLink
        :to="localePath('/account/orders')"
        class="block"
      >
        <UCard class="transition hover:ring-2 hover:ring-primary">
          <div class="flex items-center gap-4">
            <UIcon
              name="i-lucide-package"
              class="size-8 text-primary"
            />
            <div>
              <h2 class="font-semibold">
                {{ t('orders.title') }}
              </h2>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('orders.accountCard') }}
              </p>
            </div>
            <UIcon
              name="i-lucide-chevron-right"
              class="ml-auto size-5 text-muted"
            />
          </div>
        </UCard>
      </NuxtLink>

      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.preferences.title') }}
          </h2>
        </template>
        <UFormField
          :label="t('account.emailLanguage.label')"
          :description="t('account.emailLanguage.hint')"
        >
          <USelect
            :model-value="emailLocale"
            :items="localeOptions"
            value-key="value"
            :loading="savingLocale"
            class="w-48"
            @update:model-value="onEmailLocaleChange"
          />
        </UFormField>
      </UCard>
    </div>
  </NuxtLayout>
</template>
