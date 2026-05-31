<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CouponResponse } from '~/composables/queries/useCouponQueries'

/**
 * Delete-coupon confirmation modal.
 *
 * Stateless and parent-driven (mirrors `CategoryDeleteConfirm`): the page owns
 * the mutation + the success toast, passes `loading` / `error` down, and reacts
 * to `confirm`. Coupons have no cascade, so this is a plain confirm.
 */

const props = defineProps<{
  open: boolean
  coupon: CouponResponse | null
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
  if (!props.coupon || props.loading) return
  emit('confirm', props.coupon.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.coupons.delete.title')"
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
          {{ t('admin.coupons.delete.confirm', { code: coupon?.code ?? '' }) }}
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
          {{ t('admin.coupons.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          :disabled="!coupon"
          @click="onConfirm"
        >
          {{ t('admin.coupons.delete.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
