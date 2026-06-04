<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()

useHead({
  titleTemplate: '%s | Account',
})
</script>

<template>
  <NuxtLayout>
    <div class="c-account-settings">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.subtitle') }}
        </p>
      </div>

      <!-- The settings navigation now lives in the persistent account rail
           (layouts/account.vue), so the hub no longer renders an in-body nav.
           Phase 2 of the redesign flattens these routes and removes this hub. -->
    </div>
  </NuxtLayout>
</template>
