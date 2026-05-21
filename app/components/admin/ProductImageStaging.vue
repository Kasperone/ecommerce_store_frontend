<script setup lang="ts">
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import {
  IMAGE_ACCEPT_ATTR,
  MAX_IMAGE_BYTES,
  isAllowedImageType,
} from '#shared/utils/productImageValidation'

interface StagedFile {
  id: string
  file: File
  previewUrl: string
}

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:files': [files: File[]]
}>()

const { t } = useI18n()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const errors = ref<string[]>([])

const [listRef, stagedFiles] = useDragAndDrop<StagedFile>(
  [],
  {
    dragEffectAllowed: 'move',
    dragDropEffect: 'move',
    onSort: () => emitUpdate(),
  },
)

function recordError(message: string) {
  errors.value = [...errors.value, message]
}

function clearErrors() {
  errors.value = []
}

function emitUpdate() {
  emit('update:files', stagedFiles.value.map(s => s.file))
}

function addStaged(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    recordError(t('admin.products.media.errors.sizeTooLarge', { filename: file.name }))
    return
  }
  if (!isAllowedImageType(file.type)) {
    recordError(t('admin.products.media.errors.unsupportedType', { filename: file.name }))
    return
  }
  stagedFiles.value = [
    ...stagedFiles.value,
    {
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    },
  ]
  emitUpdate()
}

function removeStaged(id: string) {
  const target = stagedFiles.value.find(s => s.id === id)
  if (target) URL.revokeObjectURL(target.previewUrl)
  stagedFiles.value = stagedFiles.value.filter(s => s.id !== id)
  emitUpdate()
}

function processFiles(files: FileList | File[]) {
  clearErrors()
  for (const file of Array.from(files)) {
    addStaged(file)
  }
}

function onFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  processFiles(target.files)
  target.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (props.disabled) return
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
  processFiles(e.dataTransfer.files)
}

function onDragOver() {
  if (props.disabled) return
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function openPicker() {
  if (props.disabled) return
  fileInputRef.value?.click()
}

onBeforeUnmount(() => {
  for (const staged of stagedFiles.value) {
    URL.revokeObjectURL(staged.previewUrl)
  }
})
</script>

<template>
  <div class="space-y-3">
    <div
      :class="[
        'relative rounded-lg border-2 border-dashed transition-colors',
        'p-6 text-center cursor-pointer',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-default hover:border-accented',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]"
      role="button"
      tabindex="0"
      :aria-disabled="disabled"
      :aria-label="t('admin.products.media.dropZone')"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @drop.prevent="onDrop"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
    >
      <UIcon
        name="i-lucide-upload-cloud"
        class="w-8 h-8 mx-auto text-muted"
      />
      <p class="mt-2 text-sm font-medium">
        {{ t('admin.products.media.dropZone') }}
      </p>
      <p class="mt-1 text-xs text-muted">
        {{ t('admin.products.media.allowedTypes') }} · {{ t('admin.products.media.maxSize') }}
      </p>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      :accept="IMAGE_ACCEPT_ATTR"
      multiple
      class="sr-only"
      :disabled="disabled"
      :aria-label="t('admin.products.media.dropZone')"
      @change="onFileInputChange"
    >

    <p
      v-if="stagedFiles.length > 0"
      class="text-xs text-muted"
    >
      {{ t('admin.products.media.staging.primaryHint') }}
    </p>

    <ul
      ref="listRef"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      <li
        v-for="(staged, index) in stagedFiles"
        :key="staged.id"
        :class="[
          'border border-default rounded-lg overflow-hidden bg-default',
          stagedFiles.length > 1 ? 'cursor-move' : '',
        ]"
      >
        <div
          class="aspect-square bg-gray-100 dark:bg-gray-800
            flex items-center justify-center relative"
        >
          <img
            :src="staged.previewUrl"
            :alt="staged.file.name"
            class="w-full h-full object-contain"
          >
          <UBadge
            v-if="index === 0"
            color="primary"
            variant="solid"
            size="xs"
            class="absolute top-2 left-2"
          >
            {{ t('admin.products.media.primary') }}
          </UBadge>
          <UButton
            color="error"
            variant="solid"
            icon="i-lucide-x"
            size="xs"
            class="absolute top-2 right-2"
            :aria-label="t('admin.products.media.staging.removeAriaLabel', {
              filename: staged.file.name,
            })"
            :disabled="disabled"
            @click="removeStaged(staged.id)"
          />
        </div>
        <div
          class="p-2 text-xs text-muted truncate"
          :title="staged.file.name"
        >
          {{ staged.file.name }}
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
