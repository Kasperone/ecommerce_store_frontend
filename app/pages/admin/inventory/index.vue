<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { InventoryListItem } from '#shared/types/api'
import type { InventoryStatus } from '~/composables/queries/useInventoryQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.inventory.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'in_stock', 'low_stock', 'out_of_stock', 'backorder']).optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  status: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as InventoryStatus),
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useInventoryQuery(queryParams)
const items = computed<InventoryListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() => statusFilter.value !== 'all' || searchValue.value.length > 0)

const statusOptions = computed(() => [
  { label: t('admin.inventory.filters.allStatuses'), value: 'all' },
  { label: t('admin.inventory.status.in_stock'), value: 'in_stock' },
  { label: t('admin.inventory.status.low_stock'), value: 'low_stock' },
  { label: t('admin.inventory.status.out_of_stock'), value: 'out_of_stock' },
  { label: t('admin.inventory.status.backorder'), value: 'backorder' },
])

const STATUS_COLOR: Record<InventoryStatus, 'success' | 'warning' | 'error' | 'info'> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'error',
  backorder: 'info',
}

const columns: TableColumn<InventoryListItem>[] = [
  { accessorKey: 'name', header: () => t('admin.inventory.fields.product') },
  { accessorKey: 'sku', header: () => t('admin.inventory.fields.sku') },
  { accessorKey: 'stock', header: () => t('admin.inventory.fields.stock') },
  { accessorKey: 'low_stock_threshold', header: () => t('admin.inventory.fields.threshold') },
  { accessorKey: 'status', header: () => t('admin.inventory.fields.status') },
  { id: 'actions', header: '' },
]

// Adjust dialog state.
const dialogOpen = ref(false)
const selected = ref<InventoryListItem | null>(null)

function openAdjust(row: InventoryListItem) {
  selected.value = row
  dialogOpen.value = true
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.inventory.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.inventory.subtitle') }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-scroll-text"
          @click="navigateTo('/admin/inventory/movements')"
        >
          {{ $t('admin.inventory.actions.viewMovements') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.inventory.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.inventory.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.inventory.filters.searchPlaceholder')"
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
          {{ $t('admin.inventory.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.inventory.empty.noProducts') }}
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
        </template>
        <template #sku-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.sku ?? '—' }}</span>
        </template>
        <template #stock-cell="{ row }">
          <span class="font-semibold tabular-nums">{{ row.original.stock }}</span>
        </template>
        <template #low_stock_threshold-cell="{ row }">
          <span class="text-sm text-muted tabular-nums">
            {{ row.original.low_stock_threshold ?? '—' }}
          </span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="STATUS_COLOR[row.original.status]"
            variant="subtle"
          >
            {{ $t(`admin.inventory.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.inventory.actions.adjust')"
              @click="openAdjust(row.original)"
            >
              {{ $t('admin.inventory.actions.adjust') }}
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

      <AdminInventoryAdjustDialog
        :open="dialogOpen"
        :product-id="selected?.id ?? null"
        :product-name="selected?.name ?? ''"
        :current-stock="selected?.stock ?? 0"
        :current-threshold="selected?.low_stock_threshold ?? null"
        @update:open="(v) => (dialogOpen = v)"
      />
    </div>
  </NuxtLayout>
</template>
