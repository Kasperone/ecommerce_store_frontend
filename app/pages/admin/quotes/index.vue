<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { QuoteListItem, QuoteStatus } from '~/composables/queries/useQuoteQueries'
import { parseProblem } from '#shared/utils/problemDetails'
import { QUOTE_STATUSES, quoteStatusColor } from '#shared/utils/quoteStatus'
import { formatMoney } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('admin.quotes.title') })

const filterSchema = z.object({
  status: z.enum(['all', ...QUOTE_STATUSES]).optional(),
  // A filter key MUST live in BOTH the schema AND `defaults` — useUrlFilters
  // iterates `Object.keys(defaults)`, so a schema-only key is silently dropped.
  companyId: z.coerce.number().min(1).optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  status: 'all' as const,
  companyId: undefined as number | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as QuoteStatus),
  companyId: filters.value.companyId,
}))

const { data: pageData, error: listError } = useQuotesQuery(queryParams)

// Companies feed the filter dropdown (and the name lookup is already on each
// row via `company_name`).
const { data: companiesData } = useQuoteCompaniesQuery()
const companies = computed(() => companiesData.value?.items ?? [])

const items = computed<QuoteListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(
  () => statusFilter.value !== 'all' || filters.value.companyId != null,
)

const statusOptions = computed(() => [
  { label: t('admin.quotes.filters.allStatuses'), value: 'all' },
  ...QUOTE_STATUSES.map(s => ({ label: t(`admin.quotes.status.${s}`), value: s })),
])

const companyOptions = computed(() => [
  { label: t('admin.quotes.filters.allCompanies'), value: 'all' },
  ...companies.value.map(c => ({ label: c.name, value: String(c.id) })),
])

const companyFilterValue = computed(() =>
  filters.value.companyId != null ? String(filters.value.companyId) : 'all',
)

function onStatusChange(value: string) {
  set({ status: value as typeof defaults.status, page: 1 })
}

function onCompanyChange(value: string) {
  set({ companyId: value === 'all' ? undefined : Number(value), page: 1 })
}

function money(amount: number, currency: string) {
  return formatMoney(amount, currency as 'USD' | 'PLN' | 'EUR', locale.value)
}

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

const columns: TableColumn<QuoteListItem>[] = [
  { accessorKey: 'id', header: () => t('admin.quotes.fields.id') },
  { accessorKey: 'company_name', header: () => t('admin.quotes.fields.company') },
  { accessorKey: 'status', header: () => t('admin.quotes.fields.status') },
  { accessorKey: 'item_count', header: () => t('admin.quotes.fields.items') },
  { accessorKey: 'valid_until', header: () => t('admin.quotes.fields.validUntil') },
  { accessorKey: 'total', header: () => t('admin.quotes.fields.total') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.quotes.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.quotes.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="navigateTo(localePath('/admin/quotes/new'))"
        >
          {{ $t('admin.quotes.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.quotes.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-44"
            @update:model-value="onStatusChange"
          />
        </UFormField>
        <UFormField :label="$t('admin.quotes.filters.company')">
          <USelect
            :model-value="companyFilterValue"
            :items="companyOptions"
            value-key="value"
            class="w-56"
            @update:model-value="onCompanyChange"
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
          {{ $t('admin.quotes.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.quotes.empty.noQuotes') }}
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
            :to="localePath(`/admin/quotes/${row.original.id}`)"
            class="font-mono font-medium text-primary"
          >
            #{{ row.original.id }}
          </ULink>
        </template>
        <template #company_name-cell="{ row }">
          <span class="text-sm">{{ row.original.company_name ?? '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="quoteStatusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.quotes.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #item_count-cell="{ row }">
          {{ row.original.item_count }}
        </template>
        <template #valid_until-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.valid_until) }}</span>
        </template>
        <template #total-cell="{ row }">
          {{ money(row.original.total, row.original.currency) }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-eye"
              size="sm"
              :aria-label="$t('admin.quotes.actions.view')"
              @click="navigateTo(localePath(`/admin/quotes/${row.original.id}`))"
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
