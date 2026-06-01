<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CompanyResponse } from '~/composables/queries/useCompanyQueries'

/**
 * Delete-company confirmation modal.
 *
 * Stateless and parent-driven (mirrors `CouponDeleteConfirm`): the page owns the
 * mutation + the success toast, passes `loading` / `error` down, and reacts to
 * `confirm`.
 */

const props = defineProps<{
  open: boolean
  company: CompanyResponse | null
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
  if (!props.company || props.loading) return
  emit('confirm', props.company.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.companies.delete.title')"
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
          {{ t('admin.companies.delete.confirm', { name: company?.name ?? '' }) }}
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
          {{ t('admin.companies.delete.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          :disabled="!company"
          @click="onConfirm"
        >
          {{ t('admin.companies.delete.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
