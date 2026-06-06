<script setup lang="ts">
import type { AdminReviewListItem } from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import { reviewStatusColor } from '#shared/utils/reviewStatus'

const props = defineProps<{
  open: boolean
  review: AdminReviewListItem | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const toast = useToast()

const moderate = useModerateReview()
const removeReview = useDeleteReview()

const REPLY_MAX = 2000

// Action dialog (no client-validatable fields beyond the optional reply), so it
// converges only the error message + toast: a null form ref makes applyApiError
// skip field-mapping/scroll.
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage: error, applyApiError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})
const confirmingDelete = ref(false)
const replyText = ref('')

const moderating = computed(() => moderate.isLoading.value)
const deleting = computed(() => removeReview.isLoading.value)
const busy = computed(() => moderating.value || deleting.value)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

// Reset transient state each time the dialog opens for a (possibly different)
// row. `immediate` so a dialog mounted already-open still prefills the reply.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      error.value = ''
      confirmingDelete.value = false
      replyText.value = props.review?.admin_response ?? ''
    }
  },
  { immediate: true },
)

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

async function setStatus(status: 'approved' | 'rejected') {
  if (!props.review) return
  error.value = ''
  try {
    await moderate.mutateAsync({ id: props.review.id, status })
    toast.add({
      title: t(`admin.reviews.flashes.${status}`),
      color: status === 'approved' ? 'success' : 'warning',
      icon: status === 'approved' ? 'i-lucide-check' : 'i-lucide-x',
    })
    openModel.value = false
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

// Save (or clear, when empty) the store's public reply. Shares the moderate
// mutation/endpoint; only the admin_response key is sent.
async function saveReply() {
  if (!props.review) return
  error.value = ''
  const trimmed = replyText.value.trim()
  try {
    await moderate.mutateAsync({ id: props.review.id, adminResponse: trimmed || null })
    toast.add({
      title: t(trimmed ? 'admin.reviews.flashes.replySaved' : 'admin.reviews.flashes.replyCleared'),
      color: 'success',
      icon: 'i-lucide-message-square',
    })
    openModel.value = false
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

async function clearReply() {
  replyText.value = ''
  await saveReply()
}

// First click arms the confirm; second click deletes.
async function onDelete() {
  if (!props.review) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  error.value = ''
  try {
    await removeReview.mutateAsync(props.review.id)
    toast.add({
      title: t('admin.reviews.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-trash-2',
    })
    openModel.value = false
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('admin.reviews.dialog.title')"
    :dismissible="!busy"
  >
    <template #body>
      <div
        v-if="review"
        class="space-y-4"
      >
        <UAlert
          v-if="error"
          role="alert"
          color="error"
          variant="soft"
          :title="t('messages.saveErrorTitle')"
          :description="error"
          :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
          @close="error = ''"
        />

        <div class="flex items-center justify-between gap-3 flex-wrap">
          <ReviewStars
            :rating="review.rating"
            :aria-label="t('admin.reviews.starsLabel', { rating: review.rating })"
          />
          <div class="flex items-center gap-2">
            <UBadge
              v-if="review.is_verified_purchase"
              color="success"
              variant="subtle"
              icon="i-lucide-badge-check"
            >
              {{ $t('admin.reviews.verified') }}
            </UBadge>
            <UBadge
              :color="reviewStatusColor(review.status)"
              variant="subtle"
            >
              {{ $t(`admin.reviews.status.${review.status}`) }}
            </UBadge>
          </div>
        </div>

        <h3
          v-if="review.title"
          class="font-semibold text-lg"
        >
          {{ review.title }}
        </h3>
        <p class="text-sm whitespace-pre-line">
          {{ review.body }}
        </p>

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm pt-3 border-t border-default">
          <dt class="text-muted">
            {{ $t('admin.reviews.fields.product') }}
          </dt>
          <dd>{{ review.product_name }}</dd>
          <dt class="text-muted">
            {{ $t('admin.reviews.fields.author') }}
          </dt>
          <dd>
            {{ review.author_name }}
            <span class="text-muted">({{ review.author_email }})</span>
          </dd>
          <dt class="text-muted">
            {{ $t('admin.reviews.fields.submitted') }}
          </dt>
          <dd>{{ dateFmt.format(new Date(review.created_at)) }}</dd>
        </dl>

        <div class="pt-3 border-t border-default">
          <UFormField
            :label="t('admin.reviews.reply.label')"
            :description="t('admin.reviews.reply.hint')"
            name="adminResponse"
          >
            <UTextarea
              v-model="replyText"
              :rows="3"
              :maxlength="REPLY_MAX"
              :placeholder="t('admin.reviews.reply.placeholder')"
              :disabled="busy"
              class="w-full"
            />
          </UFormField>
          <div class="flex gap-2 mt-2">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-message-square"
              :loading="moderating"
              :disabled="deleting"
              @click="saveReply"
            >
              {{ $t('admin.reviews.reply.save') }}
            </UButton>
            <UButton
              v-if="review.admin_response"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="clearReply"
            >
              {{ $t('admin.reviews.reply.clear') }}
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <UButton
          :color="confirmingDelete ? 'error' : 'neutral'"
          :variant="confirmingDelete ? 'solid' : 'ghost'"
          icon="i-lucide-trash-2"
          :loading="deleting"
          :disabled="moderating"
          @click="onDelete"
        >
          {{ confirmingDelete
            ? $t('admin.reviews.actions.confirmDelete')
            : $t('admin.reviews.actions.delete') }}
        </UButton>
        <div class="flex gap-2">
          <UButton
            v-if="review && review.status !== 'rejected'"
            color="warning"
            variant="soft"
            icon="i-lucide-x"
            :loading="moderating"
            :disabled="deleting"
            @click="setStatus('rejected')"
          >
            {{ $t('admin.reviews.actions.reject') }}
          </UButton>
          <UButton
            v-if="review && review.status !== 'approved'"
            color="success"
            icon="i-lucide-check"
            :loading="moderating"
            :disabled="deleting"
            @click="setStatus('approved')"
          >
            {{ $t('admin.reviews.actions.approve') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
