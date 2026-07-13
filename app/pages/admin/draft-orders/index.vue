<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { DraftOrderListItem, DraftOrderStatus } from '~/composables/queries/useDraftOrderQueries'
import { parseProblem } from '#shared/utils/problemDetails'
import { DRAFT_ORDER_STATUSES, draftOrderStatusColor } from '#shared/utils/draftOrderStatus'
import { formatMoney, type CurrencyCode } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('admin.draftOrders.title') })

const filterSchema = z.object({
  status: z.enum(['all', ...DRAFT_ORDER_STATUSES]).optional(),
  // A filter key MUST live in BOTH the schema AND `defaults` — useUrlFilters
  // iterates `Object.keys(defaults)`, so a schema-only key is silently dropped.
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  status: 'all' as const,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as DraftOrderStatus),
}))

const { data: pageData, error: listError } = useDraftOrdersQuery(queryParams)

const items = computed<DraftOrderListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() => statusFilter.value !== 'all')

const statusOptions = computed(() => [
  { label: t('admin.draftOrders.filters.allStatuses'), value: 'all' },
  ...DRAFT_ORDER_STATUSES.map(s => ({ label: t(`admin.draftOrders.status.${s}`), value: s })),
])

function onStatusChange(value: string) {
  set({ status: value as typeof defaults.status, page: 1 })
}

function money(amount: number, currency: string) {
  return formatMoney(amount, currency as CurrencyCode, locale.value)
}

function customerLabel(row: DraftOrderListItem): string {
  return row.customer_email ?? row.guest_email ?? '—'
}

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

const columns: TableColumn<DraftOrderListItem>[] = [
  { accessorKey: 'id', header: () => t('admin.draftOrders.fields.id') },
  { accessorKey: 'customer', header: () => t('admin.draftOrders.fields.customer') },
  { accessorKey: 'currency', header: () => t('admin.draftOrders.fields.currency') },
  { accessorKey: 'total', header: () => t('admin.draftOrders.fields.total') },
  { accessorKey: 'status', header: () => t('admin.draftOrders.fields.status') },
  { accessorKey: 'created_at', header: () => t('admin.draftOrders.fields.created') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.draftOrders.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.draftOrders.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          data-testid="draft-order-create"
          @click="navigateTo(localePath('/admin/draft-orders/new'))"
        >
          {{ $t('admin.draftOrders.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.draftOrders.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-44"
            @update:model-value="onStatusChange"
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
          {{ $t('admin.draftOrders.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.draftOrders.empty.noDrafts') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #id-cell="{ row }">
          <ULink
            :to="localePath(`/admin/draft-orders/${row.original.id}`)"
            class="font-mono font-medium text-primary"
          >
            #{{ row.original.id }}
          </ULink>
        </template>
        <template #customer-cell="{ row }">
          <span class="text-sm">{{ customerLabel(row.original) }}</span>
        </template>
        <template #currency-cell="{ row }">
          <span class="font-mono text-sm">{{ row.original.currency }}</span>
        </template>
        <template #total-cell="{ row }">
          {{ money(row.original.total, row.original.currency) }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="draftOrderStatusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.draftOrders.status.${row.original.status}`) }}
          </UBadge>
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
              :aria-label="$t('admin.draftOrders.actions.view')"
              @click="navigateTo(localePath(`/admin/draft-orders/${row.original.id}`))"
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
