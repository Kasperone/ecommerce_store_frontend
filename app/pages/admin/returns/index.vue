<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { ReturnRequestResponse, ReturnStatus } from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'
import { RETURN_STATUSES, returnStatusColor } from '#shared/utils/returnStatus'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
useHead({ title: () => t('admin.returns.title') })

const filterSchema = z.object({
  status: z.enum(['all', ...RETURN_STATUSES]).optional(),
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
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as ReturnStatus),
}))

const { data: pageData, error: listError } = useAdminReturnsQuery(queryParams)

const items = computed<ReturnRequestResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() => statusFilter.value !== 'all')

const statusOptions = computed(() => [
  { label: t('admin.returns.filters.allStatuses'), value: 'all' },
  ...RETURN_STATUSES.map(s => ({ label: t(`admin.returns.status.${s}`), value: s })),
])

function onStatusChange(value: string) {
  set({ status: value as typeof defaults.status, page: 1 })
}

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

function itemCount(ret: ReturnRequestResponse): number {
  return (ret.items ?? []).reduce((acc, item) => acc + item.quantity, 0)
}

const columns: TableColumn<ReturnRequestResponse>[] = [
  { accessorKey: 'id', header: () => t('admin.returns.fields.id') },
  { accessorKey: 'order_number', header: () => t('admin.returns.fields.order') },
  { accessorKey: 'customer_email', header: () => t('admin.returns.fields.customer') },
  { accessorKey: 'status', header: () => t('admin.returns.fields.status') },
  { id: 'item_count', header: () => t('admin.returns.fields.items') },
  { accessorKey: 'created_at', header: () => t('admin.returns.fields.requested') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.returns.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.returns.subtitle') }}
          </p>
        </div>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.returns.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-44"
            data-testid="returns-status-filter"
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
          {{ $t('admin.returns.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.returns.empty.noReturns') }}
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
            :to="`/admin/returns/${row.original.id}`"
            class="font-mono font-medium text-primary"
          >
            #{{ row.original.id }}
          </ULink>
        </template>
        <template #order_number-cell="{ row }">
          <ULink
            :to="`/admin/orders/${row.original.order_id}`"
            class="font-mono text-sm"
          >
            {{ row.original.order_number ?? `#${row.original.order_id}` }}
          </ULink>
        </template>
        <template #customer_email-cell="{ row }">
          <span class="text-sm">{{ row.original.customer_email ?? '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="returnStatusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.returns.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #item_count-cell="{ row }">
          {{ itemCount(row.original) }}
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
              :aria-label="$t('admin.returns.actions.view')"
              @click="navigateTo(`/admin/returns/${row.original.id}`)"
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
