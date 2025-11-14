<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const tabItems = computed(() => {
  // ensure computed re-runs when locale changes
  void locale.value
  return [
    {
      label: t('auth.personal'),
      icon: 'i-lucide-user',
      slot: 'personal'
    },
    {
      label: t('auth.business'), 
      icon: 'i-lucide-building',
      slot: 'business'
    }
  ]
})
</script>

<template>
  <div class="c-sign-up flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-2xl">
      <div class="p-6">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {{ t('auth.welcome') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('authExtra.noAccount') }} <ULink to="/login" class="text-primary font-medium">{{ t('auth.login') }}</ULink>
          </p>
        </div>
        
        <UTabs
          :items="tabItems"
          class="w-full"
          variant="pill"
        >
          <template #personal>
            <FormsPersonalSignUpForm />
          </template>
          <template #business>
            <FormsBusinessSignUpForm />
          </template>
        </UTabs>
      </div>
    </UPageCard>
  </div>
</template>

