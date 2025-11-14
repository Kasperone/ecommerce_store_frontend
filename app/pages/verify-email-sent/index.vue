<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '~/stores/auth'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const authStore = useAuthStore()
const route = useRoute()
const toast = useToast()

// Get email from query params
const email = computed(() => route.query.email as string || '')

const isResending = ref(false)
const resendDisabled = ref(false)
const countdown = ref(0)

let countdownInterval: NodeJS.Timeout | null = null

const handleResend = async () => {
  if (!email.value || resendDisabled.value) return
  
  isResending.value = true
  
  const result = await authStore.resendVerification(email.value)
  
  isResending.value = false
  
  if (result.success) {
    toast.add({
      title: t('auth.verification.resendSuccess'),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    
    // Disable resend button for 60 seconds
    resendDisabled.value = true
    countdown.value = 60
    
    countdownInterval = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        resendDisabled.value = false
        if (countdownInterval) {
          clearInterval(countdownInterval)
        }
      }
    }, 1000)
  } else {
    toast.add({
      title: t('auth.verification.resendError'),
      description: result.error,
      color: 'error',
      icon: 'i-lucide-circle-x'
    })
  }
}

// Cleanup interval on unmount
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <UCard class="max-w-md w-full">
      <template #header>
        <div class="text-center">
          <div class="flex justify-center mb-4">
            <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UIcon name="i-lucide-mail" class="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 class="text-2xl font-bold">
            {{ t('auth.verification.title') }}
          </h1>
        </div>
      </template>

      <div class="space-y-4 text-center">
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('auth.verification.message') }}
        </p>
        
        <p v-if="email" class="font-semibold text-primary">
          {{ email }}
        </p>
        
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('auth.verification.instruction') }}
        </p>
        
        <UAlert
          icon="i-lucide-info"
          color="blue"
          variant="soft"
          :title="t('auth.verification.checkSpam')"
          class="text-left"
        />

        <div class="pt-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {{ t('auth.verification.didNotReceive') }}
          </p>
          
          <UButton
            :label="resendDisabled ? `${t('auth.verification.resendButton')} (${countdown}s)` : t('auth.verification.resendButton')"
            :loading="isResending"
            :disabled="resendDisabled"
            color="gray"
            variant="outline"
            block
            @click="handleResend"
          />
        </div>
      </div>

      <template #footer>
        <div class="text-center text-sm text-gray-500 dark:text-gray-400">
          <NuxtLink to="/login" class="text-primary hover:underline">
            {{ t('auth.verification.goToLogin') }}
          </NuxtLink>
        </div>
      </template>
    </UCard>
  </div>
</template>
