<script setup lang="ts">
import type { CollectionWithProductCount } from '#shared/types/api'

/**
 * Plain delete confirmation for a collection.
 *
 * Collections have no hierarchy/cascade modes (unlike categories) — deleting a
 * collection only drops the membership join rows, never the products. So this
 * is a single confirm with a product-count note.
 */

const props = defineProps<{
  open: boolean
  collection: CollectionWithProductCount | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [id: number]
  'cancel': []
}>()

const { t } = useI18n()

const deleteTitle = computed(
  () => props.collection?.name
    ?? t('admin.collections.confirm.deleteTitle', { default: 'Delete collection' }),
)

const productCount = computed(() => props.collection?.product_count ?? 0)

function onConfirm() {
  if (!props.collection || props.loading) return
  emit('confirm', props.collection.id)
}
</script>

<template>
  <UModal
    :open="open"
    :title="deleteTitle"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-sm">
          {{ t('admin.collections.confirm.deleteBody', {
            default: 'This collection will be permanently removed. The products themselves are not deleted.',
          }) }}
        </p>
        <p
          v-if="productCount > 0"
          class="text-muted text-xs"
        >
          {{ t('admin.collections.confirm.memberNote', { count: productCount }, productCount) }}
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
          {{ t('admin.collections.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          @click="onConfirm"
        >
          {{ t('admin.collections.actions.delete', { default: 'Delete' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
