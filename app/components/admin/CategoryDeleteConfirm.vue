<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CategoryWithProductCount } from '#shared/types/api'

const props = defineProps<{
  open: boolean
  category: CategoryWithProductCount | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [id: number]
  'cancel': []
}>()

const { t } = useI18n()

const productCount = computed(() => props.category?.product_count ?? 0)
const hasProducts = computed(() => productCount.value > 0)
const description = computed(() => {
  if (!props.category) return ''
  return hasProducts.value
    ? t('admin.categories.confirm.deleteBodyWithProducts', { count: productCount.value, default: `${productCount.value} products are assigned to this category. Reassign them first.` })
    : t('admin.categories.confirm.deleteBodyEmpty', { default: 'This category will be permanently removed.' })
})

function onConfirm() {
  if (props.category && !hasProducts.value) {
    emit('confirm', props.category.id)
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="category?.name ?? t('admin.categories.confirm.deleteTitle', {
      default: 'Delete category',
    })"
    :description="description"
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
          {{ t('admin.categories.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="error"
          :disabled="hasProducts"
          :loading="loading"
          @click="onConfirm"
        >
          {{ t('admin.categories.actions.delete', { default: 'Delete' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
