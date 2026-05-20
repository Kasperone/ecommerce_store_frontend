<script setup lang="ts">
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{
  productId: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  uploaded: []
}>()

const { t } = useI18n()

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 5 * 1024 * 1024

const uploadMutation = useUploadProductImage()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const currentUpload = ref<string | null>(null)
const errors = ref<string[]>([])
const successfulUploads = ref(0)

function clearErrors() {
  errors.value = []
}

function recordError(message: string) {
  errors.value = [...errors.value, message]
}

async function processFile(file: File) {
  if (file.size > MAX_BYTES) {
    recordError(t('admin.products.media.errors.sizeTooLarge', { filename: file.name }))
    return
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    recordError(t('admin.products.media.errors.unsupportedType', { filename: file.name }))
    return
  }
  const formData = new FormData()
  formData.append('file', file)
  currentUpload.value = file.name
  try {
    await uploadMutation.mutateAsync({ productId: props.productId, formData })
    successfulUploads.value += 1
    emit('uploaded')
  }
  catch (err) {
    const problem = parseProblem(err)
    recordError(
      problem?.detail
      ?? t('admin.products.media.errors.uploadFailed', { filename: file.name }),
    )
  }
  finally {
    currentUpload.value = null
  }
}

async function processFiles(files: FileList | File[]) {
  clearErrors()
  const list = Array.from(files)
  for (const file of list) {
    await processFile(file)
  }
}

function onFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  void processFiles(target.files)
  // Reset so the same file can be re-picked.
  target.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
  void processFiles(e.dataTransfer.files)
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function openPicker() {
  if (props.disabled) return
  fileInputRef.value?.click()
}
</script>

<template>
  <div class="space-y-3">
    <div
      :class="[
        'relative rounded-lg border-2 border-dashed transition-colors p-6 text-center cursor-pointer',
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
      accept="image/jpeg,image/png,image/webp"
      multiple
      class="sr-only"
      :disabled="disabled"
      :aria-label="t('admin.products.media.dropZone')"
      @change="onFileInputChange"
    >

    <div
      v-if="currentUpload"
      class="flex items-center gap-2 text-sm text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="w-4 h-4 animate-spin"
      />
      <span>{{ t('admin.products.media.uploading', { filename: currentUpload }) }}</span>
    </div>

    <div
      v-if="successfulUploads > 0 && !currentUpload && errors.length === 0"
      class="text-sm text-success"
    >
      {{ t('admin.products.media.uploadedCount', { count: successfulUploads }) }}
    </div>

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
