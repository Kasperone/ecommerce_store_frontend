<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { OrderListItem, OrderStatus } from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'
import { ORDER_STATUSES, statusColor } from '#shared/utils/orderStatus'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.orders.title') })

const filterSchema = z.object({
  status: z.enum(['all', ...ORDER_STATUSES]).optional(),
  // ISO `YYYY-MM-DD`; strings round-trip from the URL with no coercion. A filter
  // key MUST live in BOTH the schema AND `defaults` — useUrlFilters iterates
  // `Object.keys(defaults)`, so a schema-only key is silently dropped.
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  status: 'all' as const,
  dateFrom: undefined as string | undefined,
  dateTo: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as OrderStatus),
  dateFrom: filters.value.dateFrom,
  dateTo: filters.value.dateTo,
}))

const { data: pageData, error: listError } = useOrdersQuery(queryParams)

const items = computed<OrderListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(
  () => statusFilter.value !== 'all' || !!filters.value.dateFrom || !!filters.value.dateTo,
)

const statusOptions = computed(() => [
  { label: t('admin.orders.filters.allStatuses'), value: 'all' },
  ...ORDER_STATUSES.map(s => ({ label: t(`admin.orders.status.${s}`), value: s })),
])

function onStatusChange(value: string) {
  // Any filter change snaps pagination back to page 1.
  set({ status: value as typeof defaults.status, page: 1 })
}

function onDateChange(field: 'dateFrom' | 'dateTo', value: string) {
  const patch: Partial<typeof defaults> = { page: 1 }
  patch[field] = value || undefined // clearing the input drops the filter
  set(patch)
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
}

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

const columns: TableColumn<OrderListItem>[] = [
  { accessorKey: 'order_number', header: () => t('admin.orders.fields.orderNumber') },
  { accessorKey: 'customer_email', header: () => t('admin.orders.fields.customer') },
  { accessorKey: 'status', header: () => t('admin.orders.fields.status') },
  { accessorKey: 'item_count', header: () => t('admin.orders.fields.items') },
  { accessorKey: 'total', header: () => t('admin.orders.fields.total') },
  { accessorKey: 'created_at', header: () => t('admin.orders.fields.created') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.orders.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.orders.subtitle') }}
          </p>
        </div>
        <div class="flex items-end gap-3 flex-wrap">
          <UFormField :label="$t('admin.orders.filters.status')">
            <USelect
              :model-value="statusFilter"
              :items="statusOptions"
              value-key="value"
              class="w-40"
              @update:model-value="onStatusChange"
            />
          </UFormField>
          <UFormField :label="$t('admin.orders.filters.dateFrom')">
            <UInput
              type="date"
              :model-value="filters.dateFrom ?? ''"
              class="w-40"
              @update:model-value="(v) => onDateChange('dateFrom', String(v))"
            />
          </UFormField>
          <UFormField :label="$t('admin.orders.filters.dateTo')">
            <UInput
              type="date"
              :model-value="filters.dateTo ?? ''"
              class="w-40"
              @update:model-value="(v) => onDateChange('dateTo', String(v))"
            />
          </UFormField>
          <OrdersExportButton
            :status="queryParams.status"
            :date-from="queryParams.dateFrom"
            :date-to="queryParams.dateTo"
          />
        </div>
      </header>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="hasFilter">
          {{ $t('admin.orders.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.orders.empty.noOrders') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #order_number-cell="{ row }">
          <ULink
            :to="`/admin/orders/${row.original.id}`"
            class="font-mono font-medium text-primary"
          >
            {{ row.original.order_number }}
          </ULink>
        </template>
        <template #customer_email-cell="{ row }">
          <span class="text-sm">{{ row.original.customer_email ?? '-' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="statusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.orders.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #item_count-cell="{ row }">
          {{ row.original.item_count }}
        </template>
        <template #total-cell="{ row }">
          {{ formatMoney(row.original.total, row.original.currency) }}
        </template>
        <template #created_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.created_at) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-eye"
              size="sm"
              :aria-label="$t('admin.orders.actions.view')"
              @click="navigateTo(`/admin/orders/${row.original.id}`)"
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
    </div>
  </NuxtLayout>
</template>
