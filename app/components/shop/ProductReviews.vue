<script setup lang="ts">
import { createReviewSchema, type ReviewInput } from '#shared/validators/review'
import { parseProblem, type ProblemDetails } from '#shared/utils/problemDetails'
import { reviewStatusColor } from '#shared/utils/reviewStatus'
import type { ReviewResponse } from '#shared/types/api'

const props = defineProps<{ productId: number }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const authStore = useAuthStore()
const myReview = useMyReview()

const PAGE_SIZE = 10
const page = ref(1)
// Public, approved-only — SSR-fetched so reviews are crawlable.
const { data, refresh } = await useProductReviews(props.productId, page, PAGE_SIZE)

const emptySummary = { average_rating: 0, total: 0, breakdown: {} as Record<string, number> }
const summary = computed(() => data.value?.summary ?? emptySummary)
const items = computed<ReviewResponse[]>(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)

const breakdownRows = computed(() =>
  [5, 4, 3, 2, 1].map((star) => {
    const count = summary.value.breakdown?.[String(star)] ?? 0
    const pct = summary.value.total > 0 ? Math.round((count / summary.value.total) * 100) : 0
    return { star, count, pct }
  }),
)

// --- authed own review (client-only) ---
const isAuthed = computed(() => authStore.isAuthenticated)
const own = ref<ReviewResponse | null>(null)
const ownLoaded = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const submitError = ref<ProblemDetails | null>(null)
const justSubmitted = ref(false)

async function loadOwn() {
  if (!isAuthed.value) {
    ownLoaded.value = true
    return
  }
  try {
    own.value = await myReview.fetchMine(props.productId) // null → no review yet
  }
  catch {
    own.value = null
  }
  finally {
    ownLoaded.value = true
  }
}

onMounted(loadOwn)

const schema = computed(() => createReviewSchema(t))
const state = reactive<{ rating: number, title: string, body: string }>({
  rating: 0,
  title: '',
  body: '',
})

function startWrite() {
  if (own.value) {
    state.rating = own.value.rating
    state.title = own.value.title ?? ''
    state.body = own.value.body
  }
  else {
    state.rating = 0
    state.title = ''
    state.body = ''
  }
  submitError.value = null
  justSubmitted.value = false
  showForm.value = true
}

async function onSubmit(event: { data: ReviewInput }) {
  submitting.value = true
  submitError.value = null
  try {
    const body = {
      rating: event.data.rating,
      title: event.data.title?.trim() || null,
      body: event.data.body,
    }
    own.value = own.value
      ? await myReview.update(props.productId, body)
      : await myReview.create(props.productId, body)
    showForm.value = false
    justSubmitted.value = true
    // The new/edited review is `pending`, so it won't appear in the approved
    // list yet — refresh keeps the summary + list consistent regardless.
    await refresh()
  }
  catch (err) {
    submitError.value = parseProblem(err)
  }
  finally {
    submitting.value = false
  }
}

async function onDelete() {
  submitError.value = null
  try {
    await myReview.remove(props.productId)
    own.value = null
    showForm.value = false
    justSubmitted.value = false
    await refresh()
  }
  catch (err) {
    submitError.value = parseProblem(err)
  }
}

const loginTo = computed(() => localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`))
const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function starsLabel(rating: number) {
  return t('reviews.starsLabel', { rating })
}
</script>

<template>
  <section class="mt-12 border-t border-default pt-8">
    <h2 class="mb-6 text-2xl font-bold">
      {{ t('reviews.heading') }}
    </h2>

    <!-- Summary -->
    <div class="mb-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div class="flex flex-col items-center gap-1">
        <span class="text-4xl font-bold tabular-nums">{{ summary.average_rating.toFixed(1) }}</span>
        <ReviewStars
          :rating="Math.round(summary.average_rating)"
          :aria-label="starsLabel(Math.round(summary.average_rating))"
          size-class="size-5"
        />
        <span class="text-sm text-muted">
          {{ t('reviews.basedOn', summary.total, { count: summary.total }) }}
        </span>
      </div>
      <div class="space-y-1">
        <div
          v-for="row in breakdownRows"
          :key="row.star"
          class="flex items-center gap-2 text-sm"
        >
          <span class="w-12 shrink-0 text-muted">
            {{ t('reviews.starsShort', { count: row.star }) }}
          </span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
            <div
              class="h-full rounded-full bg-amber-400"
              :style="{ width: `${row.pct}%` }"
            />
          </div>
          <span class="w-8 shrink-0 text-right tabular-nums text-muted">{{ row.count }}</span>
        </div>
      </div>
    </div>

    <!-- Write / own-review area -->
    <div class="mb-8">
      <p
        v-if="!isAuthed"
        class="text-sm text-muted"
      >
        <NuxtLink
          :to="loginTo"
          class="text-primary hover:underline"
        >
          {{ t('reviews.loginToWrite') }}
        </NuxtLink>
      </p>

      <template v-else-if="ownLoaded">
        <!-- Existing review (not editing) -->
        <div
          v-if="own && !showForm"
          class="rounded-lg border border-default p-4"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-semibold">{{ t('reviews.yourReview') }}</span>
              <UBadge
                :color="reviewStatusColor(own.status)"
                variant="subtle"
              >
                {{ t(`reviews.status.${own.status}`) }}
              </UBadge>
            </div>
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-pencil"
                @click="startWrite"
              >
                {{ t('reviews.edit') }}
              </UButton>
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                @click="onDelete"
              >
                {{ t('reviews.delete') }}
              </UButton>
            </div>
          </div>
          <ReviewStars
            :rating="own.rating"
            :aria-label="starsLabel(own.rating)"
          />
          <p
            v-if="own.title"
            class="mt-2 font-medium"
          >
            {{ own.title }}
          </p>
          <p class="mt-1 whitespace-pre-line text-sm text-muted">
            {{ own.body }}
          </p>
          <div
            v-if="own.admin_response"
            class="mt-3 rounded-md bg-elevated p-3"
          >
            <p class="text-xs font-semibold">
              {{ t('reviews.storeResponse') }}
            </p>
            <p class="mt-1 whitespace-pre-line text-sm text-muted">
              {{ own.admin_response }}
            </p>
          </div>
          <p
            v-if="own.status === 'pending'"
            class="mt-2 text-xs text-muted"
          >
            {{ t('reviews.pendingNote') }}
          </p>
        </div>

        <!-- Write / edit form -->
        <UForm
          v-else-if="showForm"
          :schema="schema"
          :state="state"
          class="space-y-4 rounded-lg border border-default p-4"
          @submit="onSubmit"
        >
          <ErrorAlert
            v-if="submitError"
            :problem="submitError"
          />
          <UFormField
            :label="t('reviews.form.ratingLabel')"
            name="rating"
            required
          >
            <ReviewStarsInput
              v-model:rating="state.rating"
              :group-label="t('reviews.form.ratingLabel')"
              :star-label="(n) => t('reviews.form.rate', { count: n })"
            />
          </UFormField>
          <UFormField
            :label="t('reviews.form.titleLabel')"
            name="title"
          >
            <UInput
              v-model="state.title"
              :placeholder="t('reviews.form.titlePlaceholder')"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('reviews.form.bodyLabel')"
            name="body"
            required
          >
            <UTextarea
              v-model="state.body"
              :rows="4"
              :placeholder="t('reviews.form.bodyPlaceholder')"
              class="w-full"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="submitting"
            >
              {{ t('reviews.form.submit') }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              :disabled="submitting"
              @click="showForm = false"
            >
              {{ t('reviews.form.cancel') }}
            </UButton>
          </div>
        </UForm>

        <!-- No review yet -->
        <div v-else>
          <p
            v-if="justSubmitted"
            class="mb-3 text-sm text-success"
          >
            {{ t('reviews.form.successPending') }}
          </p>
          <UButton
            color="primary"
            variant="soft"
            icon="i-lucide-pencil"
            @click="startWrite"
          >
            {{ t('reviews.writeReview') }}
          </UButton>
        </div>
      </template>
    </div>

    <!-- Approved review list -->
    <div
      v-if="items.length === 0"
      class="text-sm text-muted"
    >
      {{ t('reviews.empty') }}
    </div>
    <ul
      v-else
      class="space-y-6"
    >
      <li
        v-for="review in items"
        :key="review.id"
        class="border-b border-default pb-6 last:border-b-0"
      >
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <ReviewStars
            :rating="review.rating"
            :aria-label="starsLabel(review.rating)"
          />
          <span class="font-medium">{{ review.author_name }}</span>
          <UBadge
            v-if="review.is_verified_purchase"
            color="success"
            variant="subtle"
            size="sm"
            icon="i-lucide-badge-check"
          >
            {{ t('reviews.verified') }}
          </UBadge>
          <span class="text-xs text-muted">{{ dateFmt.format(new Date(review.created_at)) }}</span>
        </div>
        <p
          v-if="review.title"
          class="font-medium"
        >
          {{ review.title }}
        </p>
        <p class="mt-1 whitespace-pre-line text-sm text-muted">
          {{ review.body }}
        </p>
        <div
          v-if="review.admin_response"
          class="mt-3 rounded-md bg-elevated p-3"
        >
          <p class="text-xs font-semibold">
            {{ t('reviews.storeResponse') }}
          </p>
          <p class="mt-1 whitespace-pre-line text-sm text-muted">
            {{ review.admin_response }}
          </p>
        </div>
      </li>
    </ul>

    <UPagination
      v-if="total > PAGE_SIZE"
      :total="total"
      :items-per-page="PAGE_SIZE"
      :page="page"
      class="mt-6"
      @update:page="(p) => (page = p)"
    />
  </section>
</template>
