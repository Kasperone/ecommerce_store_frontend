<script setup lang="ts">
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProductImageResponse } from '#shared/types/api'

const props = defineProps<{
  productId: number
  images: ProductImageResponse[]
}>()

const { t } = useI18n()

const updateMutation = useUpdateProductImage()
const deleteMutation = useDeleteProductImage()

const reorderInFlight = ref(false)
const errors = ref<string[]>([])
const deletePopoverId = ref<number | null>(null)
const altDrafts = ref(new Map<number, string>())

function recordError(msg: string) {
  errors.value = [...errors.value, msg]
}
function clearErrors() {
  errors.value = []
}

function snapshotIds(list: ProductImageResponse[]) {
  return list.map(i => i.id).join(',')
}

const [galleryRef, localImages] = useDragAndDrop<ProductImageResponse>(
  [...props.images],
  {
    dragEffectAllowed: 'move',
    dragDropEffect: 'move',
    onSort: handleSort,
  },
)

watch(
  () => props.images,
  (incoming) => {
    if (reorderInFlight.value) return
    if (snapshotIds(incoming) === snapshotIds(localImages.value)) {
      // Same IDs in the same order — pick up any field changes (alt_text,
      // is_primary, dimensions) without disturbing drag state.
      localImages.value = incoming.map(img => ({ ...img }))
      return
    }
    localImages.value = [...incoming]
  },
)

async function handleSort(data: {
  previousValues: ProductImageResponse[]
  values: ProductImageResponse[]
}) {
  const { previousValues, values } = data
  // Build the diff: for each image, if its new index differs from its prior
  // index, queue a PATCH with the new sort_order.
  const previousIndexById = new Map(previousValues.map((img, idx) => [img.id, idx]))
  const moved = values
    .map((img, idx) => ({ img, idx }))
    .filter(({ img, idx }) => previousIndexById.get(img.id) !== idx)

  if (moved.length === 0) return

  clearErrors()
  reorderInFlight.value = true
  const results = await Promise.allSettled(
    moved.map(({ img, idx }) =>
      updateMutation.mutateAsync({
        productId: props.productId,
        imageId: img.id,
        patch: { sort_order: idx },
      }),
    ),
  )
  reorderInFlight.value = false
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    recordError(t('admin.products.media.errors.reorderFailed'))
  }
  // Colada invalidates onSuccess; once props.images refreshes the watcher
  // syncs localImages back to backend truth.
}

async function setPrimary(image: ProductImageResponse) {
  if (image.is_primary) return
  clearErrors()
  const snapshot = localImages.value.map(i => ({ ...i }))
  localImages.value = localImages.value.map(i => ({
    ...i,
    is_primary: i.id === image.id,
  }))
  try {
    await updateMutation.mutateAsync({
      productId: props.productId,
      imageId: image.id,
      patch: { is_primary: true },
    })
  }
  catch (err) {
    localImages.value = snapshot
    const problem = parseProblem(err)
    recordError(problem?.detail ?? t('admin.products.media.errors.primaryFailed'))
  }
}

async function confirmDelete(image: ProductImageResponse) {
  clearErrors()
  deletePopoverId.value = null
  const snapshot = [...localImages.value]
  localImages.value = localImages.value.filter(i => i.id !== image.id)
  try {
    await deleteMutation.mutateAsync({
      productId: props.productId,
      imageId: image.id,
    })
  }
  catch (err) {
    localImages.value = snapshot
    const problem = parseProblem(err)
    recordError(problem?.detail ?? t('admin.products.media.errors.deleteFailed'))
  }
}

function getDraftAlt(image: ProductImageResponse) {
  return altDrafts.value.get(image.id) ?? image.alt_text ?? ''
}
function setDraftAlt(imageId: number, value: string) {
  altDrafts.value.set(imageId, value)
}

async function saveAltText(image: ProductImageResponse) {
  if (!altDrafts.value.has(image.id)) return
  const draft = altDrafts.value.get(image.id) ?? ''
  const trimmed = draft.trim() || null
  const original = image.alt_text ?? null
  if (trimmed === original) {
    altDrafts.value.delete(image.id)
    return
  }
  clearErrors()
  try {
    await updateMutation.mutateAsync({
      productId: props.productId,
      imageId: image.id,
      patch: { alt_text: trimmed },
    })
    altDrafts.value.delete(image.id)
  }
  catch (err) {
    const problem = parseProblem(err)
    recordError(problem?.detail ?? t('admin.products.media.errors.altFailed'))
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-3">
    <ul
      ref="galleryRef"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      :class="{ 'opacity-60 pointer-events-none': reorderInFlight }"
    >
      <li
        v-for="image in localImages"
        :key="image.id"
        class="border border-default rounded-lg overflow-hidden bg-default cursor-move"
      >
        <div
          class="aspect-square bg-gray-100 dark:bg-gray-800
            flex items-center justify-center relative"
        >
          <img
            :src="image.url"
            :alt="image.alt_text ?? ''"
            class="w-full h-full object-contain"
          >
          <UBadge
            v-if="image.is_primary"
            color="primary"
            variant="solid"
            size="xs"
            class="absolute top-2 left-2"
          >
            {{ t('admin.products.media.primary') }}
          </UBadge>
        </div>
        <div class="p-2 space-y-2 text-xs">
          <UInput
            :model-value="getDraftAlt(image)"
            :placeholder="t('admin.products.media.altTextPlaceholder')"
            :aria-label="t('admin.products.media.altText')"
            size="xs"
            class="w-full"
            @update:model-value="(v: string) => setDraftAlt(image.id, v)"
            @blur="saveAltText(image)"
          />
          <div class="text-muted text-2xs">
            {{ t('admin.products.media.dimensions', { width: image.width, height: image.height }) }}
            · {{ formatBytes(image.bytes) }}
          </div>
          <div class="flex items-center justify-between gap-1">
            <UButton
              v-if="!image.is_primary"
              color="neutral"
              variant="outline"
              size="xs"
              @click="setPrimary(image)"
            >
              {{ t('admin.products.media.setPrimary') }}
            </UButton>
            <span
              v-else
              class="text-2xs text-muted"
            >
              {{ t('admin.products.media.primary') }}
            </span>
            <UPopover
              :open="deletePopoverId === image.id"
              @update:open="(v: boolean) => { deletePopoverId = v ? image.id : null }"
            >
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="xs"
                :aria-label="t('admin.products.media.delete')"
              />
              <template #content>
                <div class="p-3 space-y-2 max-w-xs">
                  <div class="font-medium text-sm">
                    {{ t('admin.products.media.deleteConfirm.title') }}
                  </div>
                  <p class="text-xs text-muted">
                    {{ t('admin.products.media.deleteConfirm.body') }}
                  </p>
                  <div class="flex justify-end gap-2">
                    <UButton
                      color="neutral"
                      variant="soft"
                      size="xs"
                      @click="deletePopoverId = null"
                    >
                      {{ t('admin.products.media.deleteConfirm.no') }}
                    </UButton>
                    <UButton
                      color="error"
                      size="xs"
                      @click="confirmDelete(image)"
                    >
                      {{ t('admin.products.media.deleteConfirm.yes') }}
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </li>
    </ul>

    <ul
      v-if="errors.length"
      class="space-y-1"
    >
      <li
        v-for="(err, i) in errors"
        :key="i"
        class="flex items-start gap-2 text-sm text-error"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="w-4 h-4 mt-0.5 flex-shrink-0"
        />
        <span>{{ err }}</span>
      </li>
    </ul>
  </div>
</template>
