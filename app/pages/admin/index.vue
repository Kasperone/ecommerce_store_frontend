<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const authStore = useAuthStore()

useHead({
  titleTemplate: '%s | Admin'
})
</script>

<template>
  <NuxtLayout>
    <div class="c-admin-dashboard max-w-5xl">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">{{ t('admin.dashboard') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('admin.signedInAs') }} <span class="font-medium">{{ authStore.user?.email }}</span>
        </p>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ t('admin.placeholderTitle') }}</h2>
        </template>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('admin.placeholderBody') }}
        </p>
      </UCard>
    </div>
  </NuxtLayout>
</template>
