<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { BannerResponse } from '~/composables/queries/useBannerQueries'

/**
 * Delete-banner confirmation modal.
 *
 * Stateless and parent-driven (mirrors `CouponDeleteConfirm`): the page owns
 * the mutation + the success toast, passes `loading` / `error` down, and reacts
 * to `confirm`. Banners have no cascade, so this is a plain confirm.
 */

const props = defineProps<{
  open: boolean
  banner: BannerResponse | null
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
  if (!props.banner || props.loading) return
  emit('confirm', props.banner.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.banners.delete.title')"
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
          {{ t('admin.banners.delete.confirm', { title: banner?.title ?? '' }) }}
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
          {{ t('admin.banners.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          :disabled="!banner"
          @click="onConfirm"
        >
          {{ t('admin.banners.delete.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
