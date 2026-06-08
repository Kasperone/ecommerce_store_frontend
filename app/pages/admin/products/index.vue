<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { ProductWithCategory } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProductFilterValues, TriState } from '~/components/admin/ProductFilters.vue'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.products.title') })

const triState = z.enum(['all', 'true', 'false']).optional()

const filterSchema = z.object({
  active: triState,
  featured: triState,
  inStock: triState,
  categoryId: z.number().int().positive().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  active: 'all' as TriState,
  featured: 'all' as TriState,
  inStock: 'all' as TriState,
  categoryId: undefined as number | undefined,
  minPrice: undefined as number | undefined,
  maxPrice: undefined as number | undefined,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set, reset } = useUrlFilters(filterSchema, defaults)

function triToBool(v: TriState | undefined): boolean | undefined {
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  categoryId: filters.value.categoryId,
  isActive: triToBool(filters.value.active),
  isFeatured: triToBool(filters.value.featured),
  inStock: triToBool(filters.value.inStock),
  minPrice: filters.value.minPrice,
  maxPrice: filters.value.maxPrice,
  search: filters.value.search,
}))

const filterValues = computed<ProductFilterValues>(() => ({
  active: (filters.value.active ?? 'all') as TriState,
  featured: (filters.value.featured ?? 'all') as TriState,
  inStock: (filters.value.inStock ?? 'all') as TriState,
  categoryId: filters.value.categoryId,
  minPrice: filters.value.minPrice,
  maxPrice: filters.value.maxPrice,
  search: filters.value.search,
}))

function onFiltersUpdate(patch: Partial<ProductFilterValues>) {
  // Any filter change snaps pagination back to page 1.
  set({ ...patch, page: 1 })
}

const { data: pageData, error: listError } = useProductsQuery(queryParams)
const { data: categoriesData } = useCategoriesQuery({ isActive: true, limit: 100 })
const categories = computed(() => categoriesData.value ?? [])

const hasActiveFilters = computed(() =>
  filterValues.value.active !== 'all'
  || filterValues.value.featured !== 'all'
  || filterValues.value.inStock !== 'all'
  || filterValues.value.categoryId !== undefined
  || filterValues.value.minPrice !== undefined
  || filterValues.value.maxPrice !== undefined
  || (filterValues.value.search?.length ?? 0) > 0,
)
const items = computed<ProductWithCategory[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)

const deleting = ref<ProductWithCategory | null>(null)
const modalError = ref<ProblemDetails | null>(null)
const deleteMutation = useDeleteProduct()

// CSV import modal.
const importOpen = ref(false)

// Bulk-edit row selection — a Set of product ids. Kept in a Set (not the
// TanStack row model) so it survives pagination/filter changes deterministically.
const selectedIds = ref<Set<number>>(new Set())
const selectedList = computed(() => [...selectedIds.value])

function toggleRow(id: number, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

const allOnPageSelected = computed(() =>
  items.value.length > 0 && items.value.every(p => selectedIds.value.has(p.id)),
)

function toggleAllOnPage(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const p of items.value) {
    if (checked) next.add(p.id)
    else next.delete(p.id)
  }
  selectedIds.value = next
}

function clearSelection() {
  selectedIds.value = new Set()
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

// The admin table shows all three currencies side-by-side regardless of the
// active locale, so format each with its own fixed currency via Intl.
const usdFmt = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' })
const plnFmt = new Intl.NumberFormat('en', { style: 'currency', currency: 'PLN' })
const eurFmt = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' })

function primaryThumbnail(product: ProductWithCategory) {
  if (!product.images || product.images.length === 0) return null
  return product.images.find(img => img.is_primary) ?? product.images[0] ?? null
}

const columns: TableColumn<ProductWithCategory>[] = [
  { id: 'select', header: '' },
  { id: 'thumbnail', header: () => t('admin.products.fields.thumbnail') },
  { accessorKey: 'name', header: () => t('admin.products.fields.name') },
  { accessorKey: 'sku', header: () => t('admin.products.fields.sku') },
  { accessorKey: 'category', header: () => t('admin.products.fields.category') },
  { accessorKey: 'price_usd', header: () => t('admin.products.fields.priceUsd') },
  { accessorKey: 'price_pln', header: () => t('admin.products.fields.pricePln') },
  { accessorKey: 'price_eur', header: () => t('admin.products.fields.priceEur') },
  { accessorKey: 'stock', header: () => t('admin.products.fields.stock') },
  { accessorKey: 'is_active', header: () => t('admin.products.fields.status') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.products.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.products.subtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <AdminProductExportButton
            :category-id="queryParams.categoryId"
            :is-active="queryParams.isActive"
            :search="queryParams.search"
          />
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-upload"
            @click="importOpen = true"
          >
            {{ $t('admin.products.csv.import.button') }}
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-plus"
            @click="navigateTo('/admin/products/new')"
          >
            {{ $t('admin.products.actions.create') }}
          </UButton>
        </div>
      </header>

      <AdminProductFilters
        :values="filterValues"
        :categories="categories"
        @update:filters="onFiltersUpdate"
        @reset="reset()"
      />

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <ClientOnly>
        <AdminProductBulkEditToolbar
          v-if="selectedList.length > 0"
          :product-ids="selectedList"
          @applied="clearSelection"
        />
      </ClientOnly>

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="hasActiveFilters">
          {{ $t('admin.products.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.products.empty.noProducts') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #select-header>
          <UCheckbox
            :model-value="allOnPageSelected"
            :aria-label="$t('admin.products.bulk.selectAll')"
            @update:model-value="(v) => toggleAllOnPage(v === true)"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="selectedIds.has(row.original.id)"
            :aria-label="$t('admin.products.bulk.selectRow')"
            @update:model-value="(v) => toggleRow(row.original.id, v === true)"
          />
        </template>
        <template #thumbnail-cell="{ row }">
          <div
            class="w-12 h-12 rounded overflow-hidden bg-gray-100 dark:bg-gray-800
            flex items-center justify-center text-muted"
          >
            <img
              v-if="primaryThumbnail(row.original)"
              :src="primaryThumbnail(row.original)!.url"
              class="w-12 h-12 object-cover"
              :alt="primaryThumbnail(row.original)!.alt_text ?? ''"
            >
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="w-6 h-6"
            >
              <path
                d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2
                0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
              />
              <circle
                cx="12"
                cy="13"
                r="3"
              />
            </svg>
          </div>
        </template>
        <template #name-cell="{ row }">
          <div>
            <div class="font-medium">
              {{ row.original.name }}
            </div>
            <div class="text-xs text-muted">
              {{ row.original.slug }}
            </div>
          </div>
        </template>
        <template #sku-cell="{ row }">
          <span class="text-sm text-muted font-mono">{{ row.original.sku ?? '-' }}</span>
        </template>
        <template #category-cell="{ row }">
          {{ row.original.category?.name ?? '-' }}
        </template>
        <template #price_usd-cell="{ row }">
          {{ usdFmt.format(row.original.price_usd) }}
        </template>
        <template #price_pln-cell="{ row }">
          {{ plnFmt.format(row.original.price_pln) }}
        </template>
        <template #price_eur-cell="{ row }">
          {{ eurFmt.format(row.original.price_eur) }}
        </template>
        <template #is_active-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              :color="row.original.is_active ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ row.original.is_active
                ? $t('admin.products.status.active')
                : $t('admin.products.status.inactive') }}
            </UBadge>
            <UBadge
              v-if="row.original.is_featured"
              color="primary"
              variant="subtle"
            >
              {{ $t('admin.products.status.featured') }}
            </UBadge>
            <UBadge
              v-if="row.original.stock === 0"
              color="warning"
              variant="subtle"
            >
              {{ $t('admin.products.status.outOfStock') }}
            </UBadge>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.products.actions.edit')"
              @click="navigateTo(`/admin/products/${row.original.id}/edit`)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.products.actions.delete')"
              @click="deleting = row.original; modalError = null"
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

      <AdminProductDeleteConfirm
        :open="deleting !== null"
        :product="deleting"
        :loading="deleteMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { if (!v) deleting = null; modalError = null }"
        @confirm="onDelete"
        @cancel="deleting = null"
      />

      <AdminProductImportModal v-model:open="importOpen" />
    </div>
  </NuxtLayout>
</template>
