<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const isVerifying = ref(true)
const isSuccess = ref(false)
const errorMessage = ref('')
const countdown = ref(5)

let countdownInterval: NodeJS.Timeout | null = null

const verifyToken = async (token: string) => {
  const result = await authStore.verifyEmail(token)
  
  isVerifying.value = false
  
  if (result.success) {
    isSuccess.value = true
    
    // Start countdown and redirect to login
    countdownInterval = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        if (countdownInterval) {
          clearInterval(countdownInterval)
        }
        router.push('/login')
      }
    }, 1000)
  } else {
    isSuccess.value = false
    errorMessage.value = result.error || t('auth.verification.invalidToken')
  }
}

onMounted(() => {
  const token = route.query.token as string
  
  if (!token) {
    isVerifying.value = false
    isSuccess.value = false
    errorMessage.value = t('auth.verification.invalidToken')
    return
  }
  
  verifyToken(token)
})

// Cleanup interval on unmount
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
})

const goToLogin = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <UCard class="max-w-md w-full">
      <!-- Loading State -->
      <div v-if="isVerifying" class="py-8">
        <div class="text-center space-y-4">
          <div class="flex justify-center mb-4">
            <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UIcon name="i-lucide-loader" class="w-8 h-8 text-primary animate-spin" />
            </div>
          </div>
          <h1 class="text-2xl font-bold">
            {{ t('auth.verification.verifying') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('auth.verification.pleaseWait') }}
          </p>
        </div>
      </div>

      <!-- Success State -->
      <div v-else-if="isSuccess" class="py-8">
        <template #header>
          <div class="text-center">
            <div class="flex justify-center mb-4">
              <div class="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
                <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-success" />
              </div>
            </div>
            <h1 class="text-2xl font-bold">
              {{ t('auth.verification.success') }}
            </h1>
          </div>
        </template>

        <div class="space-y-4 text-center">
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('auth.verification.successMessage') }}
          </p>
          
          <UAlert
            icon="i-lucide-info"
            color="green"
            variant="soft"
            :title="t('auth.verification.canLogin')"
            class="text-left"
          />

          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('auth.verification.redirecting', { seconds: countdown }) }}
          </p>

          <UButton
            :label="t('auth.verification.goToLogin')"
            color="primary"
            block
            @click="goToLogin"
          />
        </div>
      </div>

      <!-- Error State -->
      <div v-else class="py-8">
        <template #header>
          <div class="text-center">
            <div class="flex justify-center mb-4">
              <div class="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center">
                <UIcon name="i-lucide-circle-x" class="w-8 h-8 text-error" />
              </div>
            </div>
            <h1 class="text-2xl font-bold">
              {{ t('auth.verification.failed') }}
            </h1>
          </div>
        </template>

        <div class="space-y-4 text-center">
          <p class="text-gray-600 dark:text-gray-400">
            {{ errorMessage }}
          </p>
          
          <UAlert
            icon="i-lucide-alert-triangle"
            color="red"
            variant="soft"
            :title="t('auth.verification.tokenExpired')"
            :description="t('auth.verification.requestNew')"
            class="text-left"
          />

          <div class="flex flex-col gap-2 pt-4">
            <UButton
              :label="t('auth.verification.goToLogin')"
              color="primary"
              variant="outline"
              block
              @click="router.push('/login')"
            />
            
            <UButton
              :label="t('common.goHome')"
              color="gray"
              variant="ghost"
              block
              @click="router.push('/')"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
