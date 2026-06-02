<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * Delete-account confirmation modal.
 *
 * IRREVERSIBLE: confirming triggers an immediate soft-delete + anonymization of
 * the account (GDPR Art. 17). Stateless and parent-driven (mirrors
 * `CampaignSendConfirm`): the privacy page owns the mutation + post-success
 * sign-out, passes `loading` / `error` down, and reacts to `confirm`. The copy
 * spells out that it cannot be undone and that personal data is anonymized.
 */

const props = defineProps<{
  open: boolean
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
  'cancel': []
}>()

const { t } = useI18n()

function onConfirm() {
  if (props.loading) return
  emit('confirm')
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('account.settings.privacy.delete.confirmTitle')"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <ErrorAlert
          v-if="error"
          :problem="error"
        />
        <p class="text-sm">
          {{ t('account.settings.privacy.delete.confirmBody') }}
        </p>
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('account.settings.privacy.delete.warningTitle')"
          :description="t('account.settings.privacy.delete.warningBody')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="emit('cancel'); emit('update:open', false)"
        >
          {{ t('account.settings.privacy.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          :loading="loading"
          @click="onConfirm"
        >
          {{ t('account.settings.privacy.delete.confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
