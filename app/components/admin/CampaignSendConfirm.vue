<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CampaignResponse } from '~/composables/queries/useCampaignQueries'

/**
 * Send-campaign confirmation modal.
 *
 * OUTWARD-FACING: confirming dispatches REAL email to everyone in the
 * resolved audience. Stateless and parent-driven (mirrors
 * `CampaignDeleteConfirm`): the page owns the mutation + success toast,
 * passes `loading` / `error` down, and reacts to `confirm`. The copy spells
 * out the audience and that this sends real email — there is no undo.
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

const audienceLabel = computed(() =>
  props.campaign ? t(`admin.campaigns.audience.${props.campaign.audience}`) : '',
)

function onConfirm() {
  if (!props.campaign || props.loading) return
  emit('confirm', props.campaign.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.campaigns.send.title')"
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
          {{ t('admin.campaigns.send.confirmBody', {
            name: campaign?.name ?? '',
            audience: audienceLabel,
          }) }}
        </p>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-mail-warning"
          :title="t('admin.campaigns.send.warningTitle')"
          :description="t('admin.campaigns.send.warningBody')"
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
          {{ t('admin.campaigns.send.cancel') }}
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-send"
          :loading="loading"
          :disabled="!campaign"
          @click="onConfirm"
        >
          {{ t('admin.campaigns.send.send') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
