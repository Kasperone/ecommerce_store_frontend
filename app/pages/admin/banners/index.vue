<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { BannerPlacement, BannerResponse } from '~/composables/queries/useBannerQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.banners.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'active', 'inactive']).optional(),
  placement: z.enum(['all', 'home_hero', 'promo_strip']).optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})
const defaults = {
  status: 'all' as const,
  placement: 'all' as const,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const placementFilter = computed(() => filters.value.placement ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  isActive:
    statusFilter.value === 'all' ? undefined : statusFilter.value === 'active',
  placement:
    placementFilter.value === 'all'
      ? undefined
      : (placementFilter.value as BannerPlacement),
}))

const { data: pageData, error: listError } = useBannersQuery(queryParams)
const items = computed<BannerResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all' || placementFilter.value !== 'all',
)

const statusOptions = computed(() => [
  { label: t('admin.banners.filters.all'), value: 'all' },
  { label: t('admin.banners.filters.active'), value: 'active' },
  { label: t('admin.banners.filters.inactive'), value: 'inactive' },
])

const placementOptions = computed(() => [
  { label: t('admin.banners.filters.allPlacements'), value: 'all' },
  { label: t('admin.banners.placement.home_hero'), value: 'home_hero' },
  { label: t('admin.banners.placement.promo_strip'), value: 'promo_strip' },
])

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

const columns: TableColumn<BannerResponse>[] = [
  { accessorKey: 'title', header: () => t('admin.banners.fields.title') },
  { accessorKey: 'placement', header: () => t('admin.banners.fields.placement') },
  { accessorKey: 'sort_order', header: () => t('admin.banners.fields.sortOrder') },
  { accessorKey: 'starts_at', header: () => t('admin.banners.fields.startsAt') },
  { accessorKey: 'ends_at', header: () => t('admin.banners.fields.endsAt') },
  { accessorKey: 'is_active', header: () => t('admin.banners.fields.status') },
  { id: 'actions', header: '' },
]

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<BannerResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(banner: BannerResponse) {
  editing.value = banner
  formOpen.value = true
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<BannerResponse | null>(null)
const deleteError = ref<ProblemDetails | null>(null)
const deleteBanner = useDeleteBanner()
const toast = useToast()

function openDelete(banner: BannerResponse) {
  deleteTarget.value = banner
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(id: number) {
  deleteError.value = null
  try {
    await deleteBanner.mutateAsync(id)
    toast.add({
      title: t('admin.banners.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    deleteOpen.value = false
  }
  catch (err) {
    deleteError.value = parseProblem(err)
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.banners.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.banners.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.banners.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.banners.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.banners.filters.placement')">
          <USelect
            :model-value="placementFilter"
            :items="placementOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ placement: v as typeof defaults.placement, page: 1 })"
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
          {{ $t('admin.banners.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.banners.empty.noBanners') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #title-cell="{ row }">
          <div class="flex items-center gap-3">
            <img
              :src="row.original.image_url"
              :alt="row.original.title"
              class="h-10 w-16 rounded object-cover bg-elevated shrink-0"
            >
            <div class="min-w-0">
              <span class="font-medium">{{ row.original.title }}</span>
              <p
                v-if="row.original.subtitle"
                class="text-muted text-xs mt-0.5 max-w-xs truncate"
              >
                {{ row.original.subtitle }}
              </p>
            </div>
          </div>
        </template>
        <template #placement-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ $t(`admin.banners.placement.${row.original.placement}`) }}
          </UBadge>
        </template>
        <template #sort_order-cell="{ row }">
          {{ row.original.sort_order }}
        </template>
        <template #starts_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.starts_at) }}</span>
        </template>
        <template #ends_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.ends_at) }}</span>
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{
              row.original.is_active
                ? $t('admin.banners.status.active')
                : $t('admin.banners.status.inactive')
            }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.banners.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.banners.actions.delete')"
              @click="openDelete(row.original)"
            />
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

      <AdminBannerFormModal
        :open="formOpen"
        :banner="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <AdminBannerDeleteConfirm
        :open="deleteOpen"
        :banner="deleteTarget"
        :loading="deleteBanner.isLoading.value"
        :error="deleteError"
        @update:open="(v) => (deleteOpen = v)"
        @confirm="confirmDelete"
      />
    </div>
  </NuxtLayout>
</template>
