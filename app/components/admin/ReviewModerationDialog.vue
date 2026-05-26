<script setup lang="ts">
import type { AdminReviewListItem } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
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

const error = ref<ProblemDetails | null>(null)
const confirmingDelete = ref(false)

const moderating = computed(() => moderate.isLoading.value)
const deleting = computed(() => removeReview.isLoading.value)
const busy = computed(() => moderating.value || deleting.value)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

// Reset transient state each time the dialog opens for a (possibly different) row.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      error.value = null
      confirmingDelete.value = false
    }
  },
)

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

async function setStatus(status: 'approved' | 'rejected') {
  if (!props.review) return
  error.value = null
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
    error.value = parseProblem(err)
  }
}

// First click arms the confirm; second click deletes.
async function onDelete() {
  if (!props.review) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  error.value = null
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
    error.value = parseProblem(err)
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
        <ErrorAlert
          v-if="error"
          :problem="error"
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
