<script setup lang="ts">
import { z } from 'zod'
import { useDebounceFn } from '@vueuse/core'
import type { TableColumn } from '@nuxt/ui'
import type { CategoryResponse, CategoryWithProductCount } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.categories.title') })

// URL-state filters.
const filterSchema = z.object({
  active: z.enum(['all', 'true', 'false']).optional(),
  search: z.string().optional(),
})

const { filters, set } = useUrlFilters(
  filterSchema,
  { active: 'all' as const, search: undefined as string | undefined },
)

const searchInput = ref(filters.value.search ?? '')
const debouncedSetSearch = useDebounceFn((value: string) => {
  set({ search: value || undefined })
}, 300)
watch(searchInput, value => debouncedSetSearch(value))

// Query params derived from URL filters.
const queryParams = computed(() => ({
  isActive: filters.value.active === 'all' ? undefined : filters.value.active === 'true',
  skip: 0,
  limit: 100,
}))

const { data: categories, error: listError } = useCategoriesQuery(queryParams)
const visibleCategories = computed<CategoryWithProductCount[]>(() => {
  const rows = categories.value ?? []
  const s = filters.value.search?.toLowerCase().trim()
  if (!s) return rows
  return rows.filter(c =>
    c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s),
  )
})

// Modals state.
const creating = ref(false)
const editing = ref<CategoryResponse | CategoryWithProductCount | null>(null)
const deleting = ref<CategoryWithProductCount | null>(null)
const modalError = ref<ProblemDetails | null>(null)

const createMutation = useCreateCategory()
const updateMutation = useUpdateCategory()
const deleteMutation = useDeleteCategory()

async function onCreate(payload: {
  name: string
  slug: string
  description?: string | null
  is_active: boolean
}) {
  modalError.value = null
  try {
    await createMutation.mutateAsync(payload)
    creating.value = false
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}

async function onUpdate(payload: {
  name: string
  slug: string
  description?: string | null
  is_active: boolean
}) {
  if (!editing.value) return
  modalError.value = null
  try {
    await updateMutation.mutateAsync({ id: editing.value.id, patch: payload })
    editing.value = null
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}

async function onDelete(id: number) {
  modalError.value = null
  try {
    await deleteMutation.mutateAsync(id)
    deleting.value = null
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}

const columns: TableColumn<CategoryWithProductCount>[] = [
  { accessorKey: 'name', header: () => t('admin.categories.fields.name') },
  { accessorKey: 'slug', header: () => t('admin.categories.fields.slug') },
  { accessorKey: 'is_active', header: () => t('admin.categories.fields.isActive') },
  { accessorKey: 'product_count', header: () => t('admin.categories.fields.productCount') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.categories.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.categories.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="creating = true; modalError = null"
        >
          {{ $t('admin.categories.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          :model-value="filters.active"
          :items="[
            { label: $t('admin.categories.filters.activeAll'), value: 'all' },
            { label: $t('admin.categories.filters.activeOnly'), value: 'true' },
            { label: $t('admin.categories.filters.inactiveOnly'), value: 'false' },
          ]"
          value-key="value"
          class="w-56"
          @update:model-value="(v) => set({ active: v as 'all' | 'true' | 'false' })"
        />
        <UInput
          v-model="searchInput"
          icon="i-lucide-search"
          :placeholder="$t('admin.categories.placeholders.search')"
          class="flex-1 min-w-64"
        />
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="visibleCategories.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="filters.search || filters.active !== 'all'">
          {{ $t('admin.categories.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.categories.empty.noCategories') }}
        </template>
      </div>

      <UTable
        v-else
        :data="visibleCategories"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ row.original.is_active
              ? $t('admin.categories.filters.activeOnly')
              : $t('admin.categories.filters.inactiveOnly') }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.categories.actions.edit')"
              @click="editing = row.original; modalError = null"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.categories.actions.delete')"
              @click="deleting = row.original; modalError = null"
            />
          </div>
        </template>
      </UTable>

      <CategoryFormModal
        :open="creating"
        :category="null"
        :loading="createMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { creating = v; if (!v) modalError = null }"
        @submit="onCreate"
        @cancel="creating = false"
      />

      <CategoryFormModal
        :open="editing !== null"
        :category="editing"
        :loading="updateMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { if (!v) editing = null; modalError = null }"
        @submit="onUpdate"
        @cancel="editing = null"
      />

      <CategoryDeleteConfirm
        :open="deleting !== null"
        :category="deleting"
        :loading="deleteMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { if (!v) deleting = null; modalError = null }"
        @confirm="onDelete"
        @cancel="deleting = null"
      />
    </div>
  </NuxtLayout>
</template>
