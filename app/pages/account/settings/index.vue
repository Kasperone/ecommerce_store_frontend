<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: 'user',
})

const { t } = useI18n()

useHead({
  titleTemplate: '%s | Account',
})
</script>

<template>
  <NuxtLayout>
    <div class="c-account-settings p-6 max-w-5xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.subtitle') }}
        </p>
      </div>

      <AccountSettingsNav />
    </div>
  </NuxtLayout>
</template>
