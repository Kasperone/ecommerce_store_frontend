<script setup lang="ts">
import {
  IMAGE_ACCEPT_ATTR,
  MAX_IMAGE_BYTES,
  isAllowedImageType,
} from '#shared/utils/productImageValidation'

/**
 * Single-file image staging for the category hero.
 *
 * Mirrors `ProductImageStaging.vue`'s drop-zone + size/type validation, but
 * scoped to ONE file (hero is 1:1 with the category). Two modes:
 *
 *  - **Existing hero** (`existingUrl` prop set): renders the current image
 *    with a small "Replace" / "Remove" toolbar. "Replace" opens the picker
 *    and stages a new file; "Remove" emits `removeExisting`. Either flips
 *    the component to "Staging".
 *  - **Staging** (a local File is selected): renders a local-URL preview
 *    with "Replace" / "Clear" buttons.
 *  - **Empty** (no existing, no staged): drop zone only.
 *
 * Emits the staged `File` (or `null`) every time it changes so the parent
 * form can build the multipart payload on submit.
 */

const props = defineProps<{
  /** Existing R2-hosted hero URL, if the category already has one. */
  existingUrl?: string | null
  existingAlt?: string | null
  /** Disabled by parent during submit. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:file': [file: File | null]
  /** Alt text edits (applies to either the existing or the staged image). */
  'update:alt': [alt: string]
  /**
   * Fired when the admin clicks Remove on an existing R2-hosted hero (NOT
   * a locally-staged file). The parent calls DELETE /hero in response.
   */
  'removeExisting': []
}>()

const { t } = useI18n()

const dropZoneLabel = computed(() =>
  t('admin.categories.hero.dropZone', { default: 'Drop image or click to upload' }),
)
const existingLabel = computed(() =>
  t('admin.categories.hero.existingLabel', { default: 'Current hero image' }),
)

// Alt text is one value regardless of whether the image is the existing R2 one
// or a freshly staged file. Seed from the existing alt; the parent also seeds
// its own copy on open, so the two stay consistent without relying on a
// mount-time emit.
const altText = ref(props.existingAlt ?? '')
watch(() => props.existingAlt, value => (altText.value = value ?? ''))

function onAltInput(value: string | number) {
  altText.value = String(value ?? '')
  emit('update:alt', altText.value)
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const error = ref<string | null>(null)
const stagedFile = ref<File | null>(null)
const stagedPreviewUrl = ref<string | null>(null)

const hasExisting = computed(() => Boolean(props.existingUrl) && !stagedFile.value)
const hasStaged = computed(() => stagedFile.value !== null)
const isEmpty = computed(() => !hasExisting.value && !hasStaged.value)

function clearStaged() {
  if (stagedPreviewUrl.value) URL.revokeObjectURL(stagedPreviewUrl.value)
  stagedFile.value = null
  stagedPreviewUrl.value = null
  emit('update:file', null)
}

function setStaged(file: File) {
  error.value = null
  if (file.size > MAX_IMAGE_BYTES) {
    error.value = t('admin.categories.hero.errors.sizeTooLarge', {
      default: 'Image is larger than 5 MiB.',
    })
    return
  }
  if (!isAllowedImageType(file.type)) {
    error.value = t('admin.categories.hero.errors.unsupportedType', {
      default: 'Unsupported image format. Allowed: JPEG, PNG, WebP.',
    })
    return
  }
  if (stagedPreviewUrl.value) URL.revokeObjectURL(stagedPreviewUrl.value)
  stagedFile.value = file
  stagedPreviewUrl.value = URL.createObjectURL(file)
  emit('update:file', file)
}

function processFiles(files: FileList | File[]) {
  const arr = Array.from(files)
  if (arr.length === 0) return
  // Single-file slot — only the first file is staged.
  const file = arr[0]
  if (file) setStaged(file)
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

function onRemoveExisting() {
  if (props.disabled) return
  emit('removeExisting')
}

onBeforeUnmount(() => {
  if (stagedPreviewUrl.value) URL.revokeObjectURL(stagedPreviewUrl.value)
})
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="isEmpty"
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
      :aria-label="dropZoneLabel"
      data-hero-drop-zone
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
        {{ dropZoneLabel }}
      </p>
      <p class="mt-1 text-xs text-muted">
        {{ t('admin.categories.hero.allowedTypes', { default: 'JPEG, PNG, WebP — up to 5 MiB' }) }}
      </p>
    </div>

    <div
      v-else
      class="relative border border-default rounded-lg overflow-hidden bg-default"
      data-hero-preview
    >
      <div class="aspect-[16/9] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <img
          :src="hasStaged ? (stagedPreviewUrl ?? '') : (existingUrl ?? '')"
          :alt="hasStaged ? stagedFile?.name : (existingAlt ?? '')"
          class="w-full h-full object-contain"
        >
      </div>
      <div class="flex items-center justify-between p-2">
        <p class="text-xs text-muted truncate flex-1">
          <template v-if="hasStaged">
            {{ stagedFile?.name }}
          </template>
          <template v-else>
            {{ existingAlt ?? existingLabel }}
          </template>
        </p>
        <div class="flex gap-1">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="disabled"
            @click="openPicker"
          >
            {{ t('admin.categories.hero.replace', { default: 'Replace' }) }}
          </UButton>
          <UButton
            v-if="hasStaged"
            size="xs"
            color="error"
            variant="soft"
            :disabled="disabled"
            @click="clearStaged"
          >
            {{ t('admin.categories.hero.clearStaged', { default: 'Clear' }) }}
          </UButton>
          <UButton
            v-else
            size="xs"
            color="error"
            variant="soft"
            :disabled="disabled"
            @click="onRemoveExisting"
          >
            {{ t('admin.categories.hero.removeExisting', { default: 'Remove' }) }}
          </UButton>
        </div>
      </div>
    </div>

    <UFormField
      v-if="!isEmpty"
      :label="t('admin.categories.hero.altLabel', { default: 'Alt text' })"
      :hint="t('admin.categories.hero.altHint', {
        default: 'Describe the image for screen readers and SEO.',
      })"
      data-hero-alt-field
    >
      <UInput
        :model-value="altText"
        :placeholder="t('admin.categories.hero.altPlaceholder', {
          default: 'e.g. Blue ceramic mug on a wooden table',
        })"
        :disabled="disabled"
        class="w-full"
        data-hero-alt-input
        @update:model-value="onAltInput"
      />
    </UFormField>

    <input
      ref="fileInputRef"
      type="file"
      :accept="IMAGE_ACCEPT_ATTR"
      class="sr-only"
      :disabled="disabled"
      :aria-label="dropZoneLabel"
      data-hero-file-input
      @change="onFileInputChange"
    >

    <p
      v-if="error"
      class="flex items-start gap-2 text-sm text-error"
      data-hero-error
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="w-4 h-4 mt-0.5 flex-shrink-0"
      />
      <span>{{ error }}</span>
    </p>
  </div>
</template>
