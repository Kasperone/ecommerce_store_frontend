<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': []
  'cancel': []
}>()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function onCancel() {
  emit('cancel')
  openModel.value = false
}

function onSubmit() {
  emit('submit')
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="title"
    :description="description"
    :dismissible="!loading"
  >
    <template #body>
      <ErrorAlert
        v-if="error"
        :problem="error"
        class="mb-4"
      />
      <form @submit.prevent="onSubmit">
        <slot name="body" />
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <slot name="footer">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="loading"
            @click="onCancel"
          >
            {{ cancelLabel ?? 'Cancel' }}
          </UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="loading"
            @click="onSubmit"
          >
            {{ submitLabel ?? 'Save' }}
          </UButton>
        </slot>
      </div>
    </template>
  </UModal>
</template>
