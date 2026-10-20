<script setup lang="ts">
import { createReviewSchema, type ReviewInput } from '#shared/validators/review'
import { reviewStatusColor } from '#shared/utils/reviewStatus'
import type { ReviewResponse } from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{ productId: number }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const authStore = useAuthStore()
const myReview = useMyReview()
const reviewVotes = useReviewVotes()
const toast = useToast()

const PAGE_SIZE = 10
const page = ref(1)
const sortBy = ref<'newest' | 'helpful'>('newest')
// Public, approved-only — SSR-fetched so reviews are crawlable.
const { data, refresh } = await useProductReviews(props.productId, page, PAGE_SIZE, sortBy)

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

// --- helpful votes (client-only, authed) ---
const votedIds = ref<Set<number>>(new Set())
const countOverride = ref<Map<number, number>>(new Map())
const pendingVote = ref<Set<number>>(new Set())

async function loadMyVotes() {
  if (!isAuthed.value) return
  try {
    votedIds.value = await reviewVotes.fetchMyVotes(props.productId)
  }
  catch {
    // Non-fatal: leave the pressed state empty; counts still render from SSR.
  }
}

// The PDP mounts this section with `hydrate-on-visible`, so `onMounted` (and
// thus the own-review + votes fetch) doesn't run until the reviews scroll into
// view. Until then the write area shows its SSR state — `v-else` loading rather
// than a silent blank (see template).
onMounted(() => {
  void loadOwn()
  void loadMyVotes()
})

// If the session restores AFTER this section has hydrated (SSR restore missed
// the cookie, client restore then flips `isAuthed` false→true), re-run the
// fetches so the write area isn't stuck on the login prompt. `isAuthenticated`
// is `!!accessToken && !!user`, so on this edge a token is guaranteed present.
watch(isAuthed, (authed, wasAuthed) => {
  if (authed && !wasAuthed) {
    ownLoaded.value = false
    void loadOwn()
    void loadMyVotes()
  }
})

function displayedCount(review: ReviewResponse): number {
  return countOverride.value.get(review.id) ?? review.helpful_count
}
function hasVoted(review: ReviewResponse): boolean {
  return votedIds.value.has(review.id)
}
// You can vote on others' approved reviews only: guests get a login link, your
// own review shows a plain count (the backend 403s a self-vote anyway).
function voteMode(review: ReviewResponse): 'guest' | 'self' | 'toggle' {
  if (!isAuthed.value) return 'guest'
  if (own.value && review.id === own.value.id) return 'self'
  return 'toggle'
}

async function toggleVote(review: ReviewResponse) {
  const id = review.id
  if (pendingVote.value.has(id)) return
  const wasVoted = votedIds.value.has(id)
  const prevOverride = countOverride.value.get(id)
  const current = prevOverride ?? review.helpful_count

  // Optimistic flip: update the pressed state + count immediately.
  countOverride.value.set(id, Math.max(0, current + (wasVoted ? -1 : 1)))
  if (wasVoted) votedIds.value.delete(id)
  else votedIds.value.add(id)
  pendingVote.value.add(id)

  try {
    const res = wasVoted
      ? await reviewVotes.unvote(props.productId, id)
      : await reviewVotes.vote(props.productId, id)
    // Reconcile to the server's authoritative count + vote state.
    countOverride.value.set(id, res.helpful_count)
    if (res.my_vote) votedIds.value.add(id)
    else votedIds.value.delete(id)
  }
  catch {
    // Roll back the optimistic change.
    if (prevOverride === undefined) countOverride.value.delete(id)
    else countOverride.value.set(id, prevOverride)
    if (wasVoted) votedIds.value.add(id)
    else votedIds.value.delete(id)
    toast.add({ title: t('reviews.voteError'), color: 'error' })
  }
  finally {
    pendingVote.value.delete(id)
  }
}

const sortItems = computed(() => [
  { label: t('reviews.sortNewest'), value: 'newest' as const },
  { label: t('reviews.sortHelpful'), value: 'helpful' as const },
])

// A fresh SSR fetch (sort/page change) carries authoritative counts — drop overrides.
watch(data, () => countOverride.value.clear())
// Reset to page 1 on a sort change so we never land past the last page.
watch(sortBy, () => {
  page.value = 1
})

const schema = computed(() => createReviewSchema(t))
const state = reactive<{ rating: number, title: string, body: string }>({
  rating: 0,
  title: '',
  body: '',
})

const reviewFormRef = useTemplateRef<ValidatedFormInstance>('reviewFormRef')
const { errorMessage, applyApiError } = useValidatedForm(reviewFormRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'reviews.form.errorTitle',
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
  errorMessage.value = ''
  justSubmitted.value = false
  showForm.value = true
}

async function onSubmit(event: { data: ReviewInput }) {
  submitting.value = true
  errorMessage.value = ''
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
    applyApiError(err, t('reviews.form.error', { default: 'Could not save your review' }))
  }
  finally {
    submitting.value = false
  }
}

async function onDelete() {
  errorMessage.value = ''
  try {
    await myReview.remove(props.productId)
    own.value = null
    showForm.value = false
    justSubmitted.value = false
    await refresh()
  }
  catch (err) {
    applyApiError(err, t('reviews.form.error', { default: 'Could not save your review' }))
  }
}

const loginTo = computed(() => localePath({ path: '/login', query: { redirect: route.fullPath } }))
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
          {{ t('reviews.basedOn', { count: summary.total }, summary.total) }}
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
          ref="reviewFormRef"
          :schema="schema"
          :state="state"
          :validate-on="[]"
          class="space-y-4 rounded-lg border border-default p-4"
          @submit="onSubmit"
        >
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            :title="t('reviews.form.errorTitle', { default: 'Could not save your review' })"
            :description="errorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="errorMessage = ''"
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
              @click="() => { showForm = false }"
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

      <!-- Authed but the own-review fetch hasn't settled yet: show a loading
           placeholder rather than a silent blank (the write area used to render
           nothing while `isAuthed && !ownLoaded`). -->
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ t('reviews.loadingOwn') }}
      </p>
    </div>

    <!-- Approved review list -->
    <div
      v-if="total > 1"
      class="mb-4 flex justify-end"
    >
      <USelect
        v-model="sortBy"
        :items="sortItems"
        :aria-label="t('reviews.sortLabel')"
        size="sm"
        class="w-48"
      />
    </div>
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
        <div class="mt-3 flex items-center gap-2">
          <UButton
            v-if="voteMode(review) === 'toggle'"
            :color="hasVoted(review) ? 'primary' : 'neutral'"
            :variant="hasVoted(review) ? 'solid' : 'outline'"
            size="xs"
            icon="i-lucide-thumbs-up"
            :disabled="pendingVote.has(review.id)"
            :aria-pressed="hasVoted(review)"
            @click="toggleVote(review)"
          >
            {{ t('reviews.helpful') }} ({{ displayedCount(review) }})
          </UButton>
          <UButton
            v-else-if="voteMode(review) === 'guest'"
            :to="loginTo"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-thumbs-up"
            :aria-label="t('reviews.loginToVote')"
          >
            {{ t('reviews.helpful') }} ({{ displayedCount(review) }})
          </UButton>
          <span
            v-else
            class="text-xs text-muted"
          >
            {{
              t('reviews.helpfulCount', { count: displayedCount(review) }, displayedCount(review))
            }}
          </span>
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
