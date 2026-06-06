<script setup lang="ts">
import type { ZodType } from 'zod'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

/**
 * Shared admin create/edit modal shell.
 *
 * Two modes:
 *  - **Gold-standard** (pass a `schema` + `state`): the body is wrapped in a
 *    `<UForm :validate-on="['submit']">`, client-side Zod validation runs on
 *    submit, and `useValidatedForm` drives scroll-to-error, type-to-clear,
 *    backend field-error mapping, an inline `UAlert`, and an error toast. The
 *    `error` prop is the raw caught error in this mode.
 *  - **Legacy** (no `schema`): the body is a plain `<form>` and the `error`
 *    prop is a `ProblemDetails` rendered via `<ErrorAlert>`. Unchanged for the
 *    consumers not yet migrated to the gold-standard flow.
 */

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  /** Legacy mode: a ProblemDetails. Gold-standard mode: the raw caught error. */
  error?: unknown
  /** Zod schema — presence switches the modal into the gold-standard flow. */
  schema?: ZodType
  /** The reactive form state object (required alongside `schema`). */
  state?: Record<string, unknown>
  /** Inline-alert / toast title for the gold-standard flow. */
  errorTitle?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': []
  'cancel': []
}>()

const { t } = useI18n()
const toast = useToast()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const alertTitle = computed(() => props.errorTitle ?? t('messages.saveErrorTitle'))

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const hiddenSubmitRef = ref<HTMLButtonElement | null>(null)

const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => props.state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// Only the gold-standard path surfaces the error here; legacy consumers keep
// rendering their ProblemDetails via <ErrorAlert> and own their toasts.
watch(
  () => props.error,
  (err) => {
    if (!props.schema) return
    if (err) applyApiError(err, props.errorTitle ?? t('messages.saveError'))
    else errorMessage.value = ''
  },
)

function onCancel() {
  emit('cancel')
  openModel.value = false
}

// Legacy <form> submit + the gold-standard <UForm> valid-submit both just
// notify the parent, which owns the mutation.
function onSubmit() {
  emit('submit')
}

// Footer button bridge: in gold-standard mode click the hidden submit so the
// browser fires a real submit and UForm validation runs before @submit; in
// legacy mode emit directly (matches the previous behaviour).
function onFooterSubmit() {
  if (props.schema) hiddenSubmitRef.value?.click()
  else onSubmit()
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
      <UForm
        v-if="schema && state"
        ref="formRef"
        :schema="schema"
        :state="state"
        :validate-on="['submit']"
        @submit="onSubmit"
      >
        <UAlert
          v-if="errorMessage"
          role="alert"
          color="error"
          variant="soft"
          class="mb-4"
          :title="alertTitle"
          :description="errorMessage"
          :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
          @close="errorMessage = ''"
        />
        <slot name="body" />
        <button
          ref="hiddenSubmitRef"
          type="submit"
          hidden
          aria-hidden="true"
          tabindex="-1"
          :disabled="loading"
        />
      </UForm>

      <template v-else>
        <ErrorAlert
          v-if="error"
          :problem="(error as ProblemDetails | null)"
          class="mb-4"
        />
        <form @submit.prevent="onSubmit">
          <slot name="body" />
        </form>
      </template>
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
            @click="onFooterSubmit"
          >
            {{ submitLabel ?? 'Save' }}
          </UButton>
        </slot>
      </div>
    </template>
  </UModal>
</template>
