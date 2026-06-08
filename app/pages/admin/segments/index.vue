<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { SegmentResponse } from '~/composables/queries/useSegmentQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.segments.title') })

const filterSchema = z.object({
  active: z.enum(['all', 'active', 'inactive']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
})
const defaults = {
  active: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const activeFilter = computed(() => filters.value.active ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  isActive:
    activeFilter.value === 'all'
      ? undefined
      : activeFilter.value === 'active',
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useSegmentsQuery(queryParams)
const items = computed<SegmentResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  activeFilter.value !== 'all' || searchValue.value.length > 0,
)

const activeOptions = computed(() => [
  { label: t('admin.segments.filters.all'), value: 'all' },
  { label: t('admin.segments.filters.active'), value: 'active' },
  { label: t('admin.segments.filters.inactive'), value: 'inactive' },
])

const columns: TableColumn<SegmentResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.segments.fields.name') },
  { accessorKey: 'is_active', header: () => t('admin.segments.fields.status') },
  { id: 'actions', header: '' },
]

const toast = useToast()

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<SegmentResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(segment: SegmentResponse) {
  editing.value = segment
  formOpen.value = true
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<SegmentResponse | null>(null)
const deleteError = ref<ReturnType<typeof parseProblem> | null>(null)
const deleteSegment = useDeleteSegment()

function openDelete(segment: SegmentResponse) {
  deleteTarget.value = segment
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(id: number) {
  deleteError.value = null
  try {
    await deleteSegment.mutateAsync(id)
    toast.add({
      title: t('admin.segments.flashes.deleted'),
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
            {{ $t('admin.segments.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.segments.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.segments.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.segments.filters.status')">
          <USelect
            :model-value="activeFilter"
            :items="activeOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ active: v as typeof defaults.active, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.segments.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.segments.filters.searchPlaceholder')"
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

      <ClientOnly>
        <div
          v-if="items.length === 0"
          class="text-muted text-sm py-12 text-center"
        >
          <template v-if="hasFilter">
            {{ $t('admin.segments.empty.noResults') }}
          </template>
          <template v-else>
            {{ $t('admin.segments.empty.noSegments') }}
          </template>
        </div>

        <UTable
          v-else
          :data="items"
          :columns="columns"
          :ui="{ td: 'align-middle' }"
        >
          <template #name-cell="{ row }">
            <span class="font-medium">{{ row.original.name }}</span>
            <p
              v-if="row.original.description"
              class="text-muted text-xs mt-0.5 max-w-md truncate"
            >
              {{ row.original.description }}
            </p>
          </template>
          <template #is_active-cell="{ row }">
            <UBadge
              :color="row.original.is_active ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ row.original.is_active
                ? $t('admin.segments.status.active')
                : $t('admin.segments.status.inactive') }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end items-center gap-1">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                size="sm"
                :aria-label="$t('admin.segments.actions.edit')"
                @click="openEdit(row.original)"
              />
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="sm"
                :aria-label="$t('admin.segments.actions.delete')"
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
      </ClientOnly>

      <AdminSegmentFormModal
        :open="formOpen"
        :segment="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <AdminSegmentDeleteConfirm
        :open="deleteOpen"
        :segment="deleteTarget"
        :loading="deleteSegment.isLoading.value"
        :error="deleteError"
        @update:open="(v) => (deleteOpen = v)"
        @confirm="confirmDelete"
      />
    </div>
  </NuxtLayout>
</template>
