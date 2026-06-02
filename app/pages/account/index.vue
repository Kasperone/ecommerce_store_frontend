<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const localePath = useLocalePath()
const { isB2B } = useCompanyContext()

useHead({
  titleTemplate: '%s | Account',
})
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

      <ClientOnly>
        <NuxtLink
          v-if="isB2B"
          :to="localePath('/account/quotes')"
          class="mt-6 block"
          data-testid="quotes-nav-card"
        >
          <UCard class="transition hover:ring-2 hover:ring-primary">
            <div class="flex items-center gap-4">
              <UIcon
                name="i-lucide-file-text"
                class="size-8 text-primary"
              />
              <div>
                <h2 class="font-semibold">
                  {{ t('account.quotes.title') }}
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('account.quotes.accountCard') }}
                </p>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-5 text-muted"
              />
            </div>
          </UCard>
        </NuxtLink>
      </ClientOnly>

      <NuxtLink
        :to="localePath('/account/settings')"
        class="mt-6 block"
      >
        <UCard class="transition hover:ring-2 hover:ring-primary">
          <div class="flex items-center gap-4">
            <UIcon
              name="i-lucide-settings"
              class="size-8 text-primary"
            />
            <div>
              <h2 class="font-semibold">
                {{ t('account.settings.title') }}
              </h2>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('account.settings.subtitle') }}
              </p>
            </div>
            <UIcon
              name="i-lucide-chevron-right"
              class="ml-auto size-5 text-muted"
            />
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </NuxtLayout>
</template>
