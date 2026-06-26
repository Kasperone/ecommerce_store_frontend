<script setup lang="ts">
/**
 * Persistent banner shown while an admin is impersonating a customer
 * (view-only). Renders nothing otherwise — `isImpersonating` is always false on
 * SSR and on a fresh client load, so there's no hydration mismatch. Exit
 * restores the admin session and returns to the customers list.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const auth = useAuthStore()
const { t } = useI18n()
const localePath = useLocalePath()

const customerName = computed(() => {
  const c = auth.impersonating
  if (!c) return ''
  return `${c.first_name} ${c.last_name}`.trim() || c.email
})

const exiting = ref(false)

async function exit() {
  exiting.value = true
  try {
    await auth.stopImpersonation()
    await navigateTo(localePath('/admin/customers'))
  }
  finally {
    exiting.value = false
  }
}
</script>

<template>
  <div
    v-if="auth.isImpersonating"
    class="sticky top-0 z-50 flex items-center justify-between gap-3 bg-warning px-4 py-2 text-sm text-white"
    role="status"
  >
    <span class="flex min-w-0 items-center gap-2">
      <UIcon
        name="i-lucide-eye"
        class="shrink-0"
      />
      <span class="truncate">
        {{ t('impersonation.banner', { name: customerName }) }}
      </span>
      <UBadge
        color="neutral"
        variant="solid"
        size="sm"
        class="shrink-0"
      >
        {{ t('impersonation.viewOnly') }}
      </UBadge>
    </span>
    <UButton
      color="neutral"
      variant="solid"
      size="xs"
      icon="i-lucide-log-out"
      :loading="exiting"
      class="shrink-0"
      @click="exit"
    >
      {{ t('impersonation.exit') }}
    </UButton>
  </div>
</template>
