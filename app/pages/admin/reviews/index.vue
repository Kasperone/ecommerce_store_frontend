<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { AdminReviewListItem } from '#shared/types/api'
import type { ReviewStatus } from '#shared/utils/reviewStatus'
import { REVIEW_STATUSES, reviewStatusColor } from '#shared/utils/reviewStatus'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.reviews.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
  rating: z.enum(['all', '1', '2', '3', '4', '5']).optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  status: 'all' as const,
  rating: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const ratingFilter = computed(() => filters.value.rating ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as ReviewStatus),
  rating: ratingFilter.value === 'all' ? undefined : Number(ratingFilter.value),
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useReviewsQuery(queryParams)
const items = computed<AdminReviewListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(
  () => statusFilter.value !== 'all' || ratingFilter.value !== 'all' || searchValue.value.length > 0,
)

const statusOptions = computed(() => [
  { label: t('admin.reviews.filters.allStatuses'), value: 'all' },
  ...REVIEW_STATUSES.map(s => ({ label: t(`admin.reviews.status.${s}`), value: s })),
])
const ratingOptions = computed(() => [
  { label: t('admin.reviews.filters.allRatings'), value: 'all' },
  ...[5, 4, 3, 2, 1].map(r => ({ label: t('admin.reviews.filters.ratingStars', { rating: r }), value: String(r) })),
])

const columns: TableColumn<AdminReviewListItem>[] = [
  { accessorKey: 'status', header: () => t('admin.reviews.fields.status') },
  { accessorKey: 'rating', header: () => t('admin.reviews.fields.rating') },
  { accessorKey: 'product_name', header: () => t('admin.reviews.fields.product') },
  { accessorKey: 'author_name', header: () => t('admin.reviews.fields.author') },
  { accessorKey: 'body', header: () => t('admin.reviews.fields.review') },
  { accessorKey: 'created_at', header: () => t('admin.reviews.fields.submitted') },
  { id: 'actions', header: '' },
]

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

function excerpt(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

// Moderation dialog state.
const dialogOpen = ref(false)
const selected = ref<AdminReviewListItem | null>(null)
function openModeration(row: AdminReviewListItem) {
  selected.value = row
  dialogOpen.value = true
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.reviews.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.reviews.subtitle') }}
        </p>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.reviews.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-44"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.reviews.filters.rating')">
          <USelect
            :model-value="ratingFilter"
            :items="ratingOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ rating: v as typeof defaults.rating, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.reviews.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.reviews.filters.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-60"
            @update:model-value="(v) => set({ search: (v as string) || undefined, page: 1 })"
          />
        </UFormField>
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="hasFilter">
          {{ $t('admin.reviews.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.reviews.empty.noReviews') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-top' }"
      >
        <template #status-cell="{ row }">
          <UBadge
            :color="reviewStatusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.reviews.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #rating-cell="{ row }">
          <ReviewStars
            :rating="row.original.rating"
            :aria-label="$t('admin.reviews.starsLabel', { rating: row.original.rating })"
          />
        </template>
        <template #product_name-cell="{ row }">
          <span class="text-sm font-medium">{{ row.original.product_name }}</span>
        </template>
        <template #author_name-cell="{ row }">
          <div class="text-sm">
            <div>{{ row.original.author_name }}</div>
            <UBadge
              v-if="row.original.is_verified_purchase"
              color="success"
              variant="subtle"
              size="sm"
              icon="i-lucide-badge-check"
            >
              {{ $t('admin.reviews.verified') }}
            </UBadge>
          </div>
        </template>
        <template #body-cell="{ row }">
          <div class="max-w-sm text-sm">
            <span
              v-if="row.original.title"
              class="font-medium"
            >{{ row.original.title }} — </span>
            <span class="text-muted">{{ excerpt(row.original.body) }}</span>
          </div>
        </template>
        <template #created_at-cell="{ row }">
          <span class="text-sm text-muted whitespace-nowrap">
            {{ formatDate(row.original.created_at) }}
          </span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-gavel"
              size="sm"
              :aria-label="$t('admin.reviews.actions.moderate')"
              @click="openModeration(row.original)"
            >
              {{ $t('admin.reviews.actions.moderate') }}
            </UButton>
          </div>
        </template>
      </UTable>

      <UPagination
        v-if="total > queryParams.pageSize"
        :total="total"
        :items-per-page="queryParams.pageSize"
        :page="queryParams.page"
        class="mt-4"
        @update:page="(p) => set({ page: p })"
      />

      <AdminReviewModerationDialog
        :open="dialogOpen"
        :review="selected"
        @update:open="(v) => (dialogOpen = v)"
      />
    </div>
  </NuxtLayout>
</template>
