<script setup lang="ts">
/**
 * CMS `image_picker` control — an R2-backed upload widget with a manual
 * paste-URL fallback.
 *
 * The model value stays a plain URL string (matching the backend's
 * `image_url: str | None`): uploading pushes the file to `POST /admin/media`
 * and writes the returned public R2 URL into the field; the manual input lets
 * an admin paste an external/R2 URL directly (kept deliberately — useful for
 * already-hosted images and for tests). A thumbnail previews the current value.
 *
 * Interaction modelled on `ProductImageUploader.vue` (drag/drop, progress,
 * error surfacing) but single-file and URL-string-valued rather than
 * product-scoped.
 */
import { computed, ref } from 'vue'
import { parseProblem } from '#shared/utils/problemDetails'
import {
  IMAGE_ACCEPT_ATTR,
  MAX_IMAGE_BYTES,
  isAllowedImageType,
} from '#shared/utils/productImageValidation'

const props = defineProps<{
  /** The control's DOM id (mirrors the other SettingsForm controls). */
  fieldId: string
  /** The current image URL (plain string), or empty. */
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const toast = useToast()

const uploadMutation = useUploadCmsMedia()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isUploading = ref(false)

const currentUrl = computed(() => props.modelValue ?? '')
const hasImage = computed(() => currentUrl.value.trim().length > 0)

function setUrl(value: string) {
  emit('update:modelValue', value)
}

async function processFile(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    toast.add({
      title: t('admin.cms.imagePicker.errors.sizeTooLarge'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
    return
  }
  if (!isAllowedImageType(file.type)) {
    toast.add({
      title: t('admin.cms.imagePicker.errors.unsupportedType'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  isUploading.value = true
  try {
    const res = await uploadMutation.mutateAsync({ formData })
    setUrl(res.url)
  }
  catch (err) {
    const problem = parseProblem(err)
    toast.add({
      title: problem?.detail ?? t('admin.cms.imagePicker.errors.uploadFailed'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    isUploading.value = false
  }
}

function onFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  void processFile(target.files[0]!)
  // Reset so the same file can be re-picked.
  target.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
  void processFile(e.dataTransfer.files[0]!)
}

function openPicker() {
  fileInputRef.value?.click()
}

function clearImage() {
  setUrl('')
}
</script>

<template>
  <div class="space-y-3">
    <!-- Current image preview + clear -->
    <div
      v-if="hasImage"
      class="flex items-start gap-3"
    >
      <NuxtImg
        :src="currentUrl"
        :alt="t('admin.cms.imagePicker.thumbnailAlt')"
        width="96"
        height="96"
        fit="cover"
        class="h-24 w-24 flex-shrink-0 rounded-lg border border-default object-cover bg-elevated"
        data-testid="image-picker-thumbnail"
      />
      <UButton
        type="button"
        size="xs"
        color="neutral"
        variant="subtle"
        icon="i-lucide-x"
        :label="t('admin.cms.imagePicker.remove')"
        @click="clearImage"
      />
    </div>

    <!-- Drop zone / upload trigger -->
    <div
      :class="[
        'relative rounded-lg border-2 border-dashed transition-colors',
        'p-4 text-center cursor-pointer',
        isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-accented',
      ]"
      role="button"
      tabindex="0"
      :aria-label="t('admin.cms.imagePicker.upload')"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @drop.prevent="onDrop"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
    >
      <div
        v-if="isUploading"
        class="flex items-center justify-center gap-2 text-sm text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="h-4 w-4 animate-spin"
        />
        <span>{{ t('admin.cms.imagePicker.uploading') }}</span>
      </div>
      <template v-else>
        <UIcon
          name="i-lucide-upload-cloud"
          class="mx-auto h-6 w-6 text-muted"
        />
        <p class="mt-1 text-sm font-medium">
          {{ t('admin.cms.imagePicker.upload') }}
        </p>
        <p class="mt-0.5 text-xs text-muted">
          {{ t('admin.cms.imagePicker.hint') }}
        </p>
      </template>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      :accept="IMAGE_ACCEPT_ATTR"
      class="sr-only"
      :aria-label="t('admin.cms.imagePicker.upload')"
      @change="onFileInputChange"
    >

    <!-- Manual URL fallback (kept for external/R2 URLs) -->
    <div class="space-y-1">
      <label
        :for="`setting-${fieldId}`"
        class="text-xs text-muted"
      >
        {{ t('admin.cms.imagePicker.orPasteUrl') }}
      </label>
      <UInput
        :id="`setting-${fieldId}`"
        :model-value="currentUrl"
        type="url"
        icon="i-lucide-image"
        :placeholder="t('admin.cms.controls.imageUrlPlaceholder')"
        class="w-full"
        @update:model-value="(v) => setUrl(String(v))"
      />
    </div>
  </div>
</template>
