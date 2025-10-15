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
            <UButton
              icon="i-heroicons-shopping-cart"
              color="primary"
              variant="soft"
            >
              Cart (0)
            </UButton>
            
            <UButton
              icon="i-heroicons-user"
              color="gray"
              variant="ghost"
            >
              Login
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
              Welcome to Our Store
            </h2>
            <p class="text-lg text-gray-600 dark:text-gray-400">
              Modern e-commerce platform built with Nuxt 4 and FastAPI
            </p>
          </div>
        </template>

        <div class="grid md:grid-cols-2 gap-6 my-8">
          <UCard>
            <div class="flex items-start gap-4">
              <div class="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                <UIcon name="i-heroicons-rocket-launch" class="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 class="font-semibold text-lg mb-2">Fast & Modern</h3>
                <p class="text-gray-600 dark:text-gray-400">
                  Built with latest technologies for best performance
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
                <h3 class="font-semibold text-lg mb-2">Secure Payments</h3>
                <p class="text-gray-600 dark:text-gray-400">
                  PayU and Stripe integration for safe transactions
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
              Test API Connection
            </UButton>
            
            <UButton
              size="lg"
              color="gray"
              variant="outline"
              to="https://github.com/Kasperone"
              target="_blank"
            >
              View on GitHub
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
const config = useRuntimeConfig()
const apiStatus = ref<{ success: boolean; message: string; data?: any } | null>(null)

const testApi = async () => {
  try {
    const response = await $fetch(`${config.public.apiBase}/health`)
    apiStatus.value = {
      success: true,
      message: 'API connection successful!',
      data: response
    }
  } catch (error) {
    apiStatus.value = {
      success: false,
      message: 'Failed to connect to API. Make sure backend is running on ' + config.public.apiBase
    }
  }
}

useHead({
  title: 'Home'
})
</script>
