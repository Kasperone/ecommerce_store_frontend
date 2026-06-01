<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CampaignResponse } from '~/composables/queries/useCampaignQueries'

/**
 * Delete-campaign confirmation modal.
 *
 * Stateless and parent-driven (mirrors `CouponDeleteConfirm`): the page owns
 * the mutation + the success toast, passes `loading` / `error` down, and reacts
 * to `confirm`. Campaigns have no cascade, so this is a plain confirm.
 */

const props = defineProps<{
  open: boolean
  campaign: CampaignResponse | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [id: number]
  'cancel': []
}>()

const { t } = useI18n()

function onConfirm() {
  if (!props.campaign || props.loading) return
  emit('confirm', props.campaign.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.campaigns.delete.title')"
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
          {{ t('admin.campaigns.delete.confirm', { name: campaign?.name ?? '' }) }}
        </p>
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
          {{ t('admin.campaigns.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          :disabled="!campaign"
          @click="onConfirm"
        >
          {{ t('admin.campaigns.delete.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
