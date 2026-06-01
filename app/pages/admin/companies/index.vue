<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { CompanyResponse, CompanyStatus } from '~/composables/queries/useCompanyQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.companies.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
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
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as CompanyStatus),
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useCompaniesQuery(queryParams)
const items = computed<CompanyResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all' || searchValue.value.length > 0,
)

const statusOptions = computed(() => [
  { label: t('admin.companies.filters.all'), value: 'all' },
  { label: t('admin.companies.status.pending'), value: 'pending' },
  { label: t('admin.companies.status.approved'), value: 'approved' },
  { label: t('admin.companies.status.rejected'), value: 'rejected' },
])

const statusColor: Record<CompanyStatus, 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

const columns: TableColumn<CompanyResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.companies.fields.name') },
  { accessorKey: 'tax_id', header: () => t('admin.companies.fields.taxId') },
  { accessorKey: 'email', header: () => t('admin.companies.fields.email') },
  { accessorKey: 'account_manager', header: () => t('admin.companies.fields.accountManager') },
  { accessorKey: 'status', header: () => t('admin.companies.fields.status') },
  { id: 'actions', header: '' },
]

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<CompanyResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(company: CompanyResponse) {
  editing.value = company
  formOpen.value = true
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<CompanyResponse | null>(null)
const deleteError = ref<ProblemDetails | null>(null)
const deleteCompany = useDeleteCompany()
const toast = useToast()

function openDelete(company: CompanyResponse) {
  deleteTarget.value = company
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(id: number) {
  deleteError.value = null
  try {
    await deleteCompany.mutateAsync(id)
    toast.add({
      title: t('admin.companies.flashes.deleted'),
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
            {{ $t('admin.companies.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.companies.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.companies.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.companies.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.companies.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.companies.filters.searchPlaceholder')"
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
          {{ $t('admin.companies.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.companies.empty.noCompanies') }}
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
        <template #tax_id-cell="{ row }">
          <span class="font-mono text-sm">{{ row.original.tax_id || '—' }}</span>
        </template>
        <template #email-cell="{ row }">
          <span class="text-sm">{{ row.original.email || '—' }}</span>
        </template>
        <template #account_manager-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.account_manager || '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="statusColor[row.original.status]"
            variant="subtle"
          >
            {{ $t(`admin.companies.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.companies.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.companies.actions.delete')"
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

      <AdminCompanyFormModal
        :open="formOpen"
        :company="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <AdminCompanyDeleteConfirm
        :open="deleteOpen"
        :company="deleteTarget"
        :loading="deleteCompany.isLoading.value"
        :error="deleteError"
        @update:open="(v) => (deleteOpen = v)"
        @confirm="confirmDelete"
      />
    </div>
  </NuxtLayout>
</template>
