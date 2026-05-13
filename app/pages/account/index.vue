<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: 'user'
})

const { t } = useI18n()
const authStore = useAuthStore()

useHead({
  titleTemplate: '%s | Account'
})
</script>

<template>
  <NuxtLayout>
    <div class="c-account-dashboard p-6 max-w-5xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">{{ t('account.dashboard') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.signedInAs') }} <span class="font-medium">{{ authStore.user?.email }}</span>
        </p>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ t('account.placeholderTitle') }}</h2>
        </template>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.placeholderBody') }}
        </p>
      </UCard>
    </div>
  </NuxtLayout>
</template>
