<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ProductWithCategory } from '#shared/types/api'

const props = defineProps<{
  open: boolean
  product: ProductWithCategory | null
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
  if (props.product) {
    emit('confirm', props.product.id)
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="product?.name ?? t('admin.products.confirm.deleteTitle', { default: 'Delete product' })"
    :description="t('admin.products.confirm.deleteBody', { default: 'This product will be permanently removed.' })"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <ErrorAlert
        v-if="error"
        :problem="error"
        class="mb-2"
      />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="emit('cancel'); emit('update:open', false)"
        >
          {{ t('admin.products.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          @click="onConfirm"
        >
          {{ t('admin.products.actions.delete', { default: 'Delete' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
