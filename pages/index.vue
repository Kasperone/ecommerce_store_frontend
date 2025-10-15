<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow">
      <div class="container mx-auto px-4 py-6">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            E-commerce Store
          </h1>
          
          <div class="flex items-center gap-4">
            <!-- Language Switcher -->
            <UButton
              v-if="locale === 'en'"
              color="gray"
              variant="ghost"
              @click="setLocale('pl')"
            >
              🇵🇱 PL
            </UButton>
            <UButton
              v-else
              color="gray"
              variant="ghost"
              @click="setLocale('en')"
            >
              🇺🇸 EN
            </UButton>
            
            <UButton
              icon="i-heroicons-shopping-cart"
              color="primary"
              variant="soft"
            >
              {{ t('header.cart') }} (0)
            </UButton>
            
            <UButton
              icon="i-heroicons-user"
              color="gray"
              variant="ghost"
            >
              {{ t('header.login') }}
            </UButton>
          </div>
        </div>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="container mx-auto px-4 py-12">
      <UCard>
        <template #header>
          <div class="text-center">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              {{ t('hero.welcome') }}
            </h2>
            <p class="text-lg text-gray-600 dark:text-gray-400">
              {{ t('hero.subtitle') }}
            </p>
            <!-- Currency Display -->
            <div class="mt-4 space-y-2">
              <p class="text-sm text-gray-500">
                Current currency: {{ currentCurrency.code }}
              </p>
              <div class="flex gap-4 text-sm">
                <span>Sample price:</span>
                <span class="font-semibold">{{ formatPrice(99.99) }}</span>
              </div>
              <!-- All currency examples -->
              <div class="flex gap-4 text-xs text-gray-400">
                <span v-for="curr in availableCurrencies" :key="curr.code">
                  {{ curr.code }}: {{ formatPrice(99.99, curr.code) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <div class="grid md:grid-cols-2 gap-6 my-8">
          <UCard>
            <div class="flex items-start gap-4">
              <div class="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                <UIcon name="i-heroicons-rocket-launch" class="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 class="font-semibold text-lg mb-2">{{ t('features.fastModern.title') }}</h3>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('features.fastModern.description') }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-start gap-4">
              <div class="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 class="font-semibold text-lg mb-2">{{ t('features.securePayments.title') }}</h3>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ t('features.securePayments.description') }}
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <template #footer>
          <div class="flex justify-center gap-4">
            <UButton
              size="lg"
              color="primary"
              @click="testApi"
            >
              {{ t('cta.testApi') }}
            </UButton>
            
            <UButton
              size="lg"
              color="gray"
              variant="outline"
              to="https://github.com/Kasperone"
              target="_blank"
            >
              {{ t('cta.viewGithub') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </section>

    <!-- API Status -->
    <section class="container mx-auto px-4 py-8">
      <UCard v-if="apiStatus" :ui="{ body: { padding: 'p-4' } }">
        <div class="flex items-center gap-3">
          <UIcon 
            :name="apiStatus.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            :class="apiStatus.success ? 'text-green-500' : 'text-red-500'"
            class="w-6 h-6"
          />
          <div>
            <p class="font-semibold">{{ apiStatus.message }}</p>
            <p v-if="apiStatus.data" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ JSON.stringify(apiStatus.data) }}
            </p>
          </div>
        </div>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
const { currentCurrency, availableCurrencies, formatPrice } = useCurrency()
const config = useRuntimeConfig()
const apiStatus = ref<{ success: boolean; message: string; data?: any } | null>(null)

const testApi = async () => {
  try {
    const response = await $fetch(`${config.public.apiBase}/health`)
    apiStatus.value = {
      success: true,
      message: t('api.success'),
      data: response
    }
  } catch (error) {
    apiStatus.value = {
      success: false,
      message: t('api.failed')
    }
  }
}

useHead({
  title: 'Home'
})
</script>