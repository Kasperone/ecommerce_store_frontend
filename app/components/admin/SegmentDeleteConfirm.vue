<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { SegmentResponse } from '~/composables/queries/useSegmentQueries'

/**
 * Delete-segment confirmation modal.
 *
 * Stateless and parent-driven (mirrors `CampaignDeleteConfirm`): the page owns
 * the mutation + the success toast, passes `loading` / `error` down, and reacts
 * to `confirm`. Segments have no cascade, so this is a plain confirm.
 */

const props = defineProps<{
  open: boolean
  segment: SegmentResponse | null
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
  if (!props.segment || props.loading) return
  emit('confirm', props.segment.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.segments.delete.title')"
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
          {{ t('admin.segments.delete.confirm', { name: segment?.name ?? '' }) }}
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
          {{ t('admin.segments.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          :disabled="!segment"
          @click="onConfirm"
        >
          {{ t('admin.segments.delete.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
